import { createHash } from 'node:crypto';
import { join } from 'node:path';

// Exact ordered migration chain. Edit this single list when the parent adds
// the next migration (e.g. pagination); all local gates read the same chain.
export const MIGRATION_FILES = [
  'supabase/migrations/20261015183529_rights_hardening.sql',
  'supabase/migrations/20261017000000_proposal_status_collapse.sql',
  'supabase/migrations/20261022143718_rights_filtered_queues.sql',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

// Pure helper: callers supply root + a file reader so this module performs
// no I/O itself and stays reusable across runners.
export function loadMigrationChain(root, readFile) {
  return MIGRATION_FILES.map((file) => {
    const sql = readFile(join(root, file));
    return { file, sql, sha256: sha256(sql) };
  });
}

export function verifyMigrationChain(root, readFile, expected) {
  const chain = loadMigrationChain(root, readFile);
  if (!Array.isArray(expected) || expected.length !== chain.length) {
    throw new Error(`Explicit SHA-256 required for every migration in the chain (${chain.length} files); never apply a file being written`);
  }
  for (const [index, entry] of chain.entries()) {
    if (!/^[a-f0-9]{64}$/u.test(expected[index] ?? '') || expected[index] !== entry.sha256) {
      throw new Error(`Migration checksum mismatch for ${entry.file}; never apply a file being written`);
    }
  }
  return chain;
}
