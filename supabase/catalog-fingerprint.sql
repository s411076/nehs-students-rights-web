-- Read-only; returns one JSON object. Use the normal public search path for
-- consistent PostgreSQL deparsing. App rows, OIDs, dropped columns and
-- platform default privileges are excluded; actual object grants are included.
WITH schemas AS (
  SELECT * FROM pg_catalog.pg_namespace WHERE nspname = 'public' OR starts_with(nspname, 'rights_')
), relations AS (
  SELECT c.*, format('%I.%I', n.nspname, c.relname) AS object_name
  FROM pg_catalog.pg_class c JOIN schemas n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
), columns AS (
  SELECT a.*, r.object_name || '.' || quote_ident(a.attname) AS object_name,
    row_number() OVER (PARTITION BY a.attrelid ORDER BY a.attnum) AS position
  FROM pg_catalog.pg_attribute a JOIN relations r ON r.oid = a.attrelid
  WHERE a.attnum > 0 AND NOT a.attisdropped AND r.relkind <> 'S'
), routines AS (
  SELECT p.*, format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS object_name
  FROM pg_catalog.pg_proc p JOIN schemas n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p', 'w')
), acl_objects AS (
  SELECT 'schema' AS kind, nspname::text AS object_name, coalesce(nspacl, acldefault('n', nspowner)) AS acl FROM schemas
  UNION ALL
  SELECT 'relation', object_name, coalesce(relacl, acldefault(
    (CASE WHEN relkind = 'S' THEN 's' ELSE 'r' END)::"char", relowner))
  FROM relations
  UNION ALL
  SELECT 'column', object_name, attacl FROM columns
  UNION ALL
  SELECT 'routine', object_name, coalesce(proacl, acldefault('f', proowner)) FROM routines
), objects(category, name, detail) AS (
  SELECT 'schemas', nspname, jsonb_build_object('owner', pg_get_userbyid(nspowner)) FROM schemas
  UNION ALL
  SELECT 'relations', object_name, jsonb_build_object('kind', relkind, 'owner', pg_get_userbyid(relowner),
    'rls', relrowsecurity, 'force_rls', relforcerowsecurity,
    'definition', CASE WHEN relkind IN ('v', 'm') THEN pg_get_viewdef(oid) END,
    'partition_key', CASE WHEN relkind = 'p' THEN pg_get_partkeydef(oid) END,
    'partition_bound', pg_get_expr(relpartbound, oid), 'options', reloptions,
    'comment', obj_description(oid, 'pg_class'))
  FROM relations
  UNION ALL
  SELECT 'columns', c.object_name, jsonb_build_object('position', c.position, 'type', format_type(c.atttypid, c.atttypmod),
    'not_null', c.attnotnull, 'identity', c.attidentity, 'generated', c.attgenerated,
    'default', pg_get_expr(d.adbin, d.adrelid), 'collation', c.attcollation::regcollation::text,
    'comment', col_description(c.attrelid, c.attnum))
  FROM columns c LEFT JOIN pg_catalog.pg_attrdef d ON (d.adrelid, d.adnum) = (c.attrelid, c.attnum)
  UNION ALL
  SELECT 'constraints', r.object_name || '.' || quote_ident(c.conname),
    jsonb_build_object('definition', pg_get_constraintdef(c.oid), 'validated', c.convalidated)
  FROM pg_catalog.pg_constraint c JOIN relations r ON r.oid = c.conrelid
  UNION ALL
  SELECT 'indexes', r.object_name || '.' || quote_ident(i.relname),
    jsonb_build_object('definition', pg_get_indexdef(i.oid), 'valid', x.indisvalid)
  FROM pg_catalog.pg_index x JOIN relations r ON r.oid = x.indrelid JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
  UNION ALL
  SELECT 'sequences', r.object_name, to_jsonb(s) - 'seqrelid' - 'seqtypid' ||
    jsonb_build_object('type', format_type(s.seqtypid, NULL), 'owned_by', c.object_name)
  FROM pg_catalog.pg_sequence s JOIN relations r ON r.oid = s.seqrelid
  LEFT JOIN pg_catalog.pg_depend d ON d.classid = 'pg_class'::regclass AND d.objid = s.seqrelid
    AND d.refclassid = 'pg_class'::regclass AND d.deptype IN ('a', 'i')
  LEFT JOIN columns c ON (c.attrelid, c.attnum) = (d.refobjid, d.refobjsubid)
  UNION ALL
  SELECT 'functions', object_name, jsonb_build_object('owner', pg_get_userbyid(proowner),
    'definition_sha256', encode(sha256(convert_to(pg_get_functiondef(oid), 'UTF8')), 'hex'),
    'comment', obj_description(oid, 'pg_proc'))
  FROM routines
  UNION ALL
  SELECT 'policies', r.object_name || '.' || quote_ident(p.polname),
    jsonb_build_object('command', p.polcmd, 'permissive', p.polpermissive,
      'roles', ARRAY(SELECT CASE WHEN role_id = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id)::text END
        FROM unnest(p.polroles) AS role_id ORDER BY 1),
      'using', pg_get_expr(p.polqual, p.polrelid), 'with_check', pg_get_expr(p.polwithcheck, p.polrelid))
  FROM pg_catalog.pg_policy p JOIN relations r ON r.oid = p.polrelid
  UNION ALL
  SELECT 'triggers', r.object_name || '.' || quote_ident(t.tgname),
    jsonb_build_object('definition', pg_get_triggerdef(t.oid), 'enabled', t.tgenabled)
  FROM pg_catalog.pg_trigger t JOIN relations r ON r.oid = t.tgrelid WHERE NOT t.tgisinternal
  UNION ALL
  SELECT 'grants', a.kind || ' ' || a.object_name, jsonb_agg(
    jsonb_build_object('grantee', CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee)::text END,
      'grantor', pg_get_userbyid(g.grantor), 'privilege', g.privilege_type, 'grantable', g.is_grantable)
    ORDER BY pg_get_userbyid(g.grantee), pg_get_userbyid(g.grantor), g.privilege_type)
  FROM acl_objects a CROSS JOIN LATERAL aclexplode(a.acl) g
  GROUP BY a.kind, a.object_name
  UNION ALL
  SELECT 'roles', rolname, to_jsonb(r) - ARRAY['oid', 'rolpassword', 'rolconfig']
  FROM pg_catalog.pg_roles r WHERE rolname = 'rights_executor'
  UNION ALL
  SELECT 'role_memberships', pg_get_userbyid(m.member) || ' by ' || pg_get_userbyid(m.grantor),
    jsonb_build_object('admin', m.admin_option, 'inherit', m.inherit_option, 'set', m.set_option)
  FROM pg_catalog.pg_auth_members m
  WHERE m.roleid = to_regrole('rights_executor')
), sections AS (
  SELECT category, jsonb_object_agg(name, detail) AS details FROM objects GROUP BY category
)
SELECT jsonb_object_agg(category, details) AS catalog_fingerprint FROM sections;
