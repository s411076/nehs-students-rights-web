import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const POSTGRES_IMAGE = 'supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function loadMigrationChain(root) {
  const directory = 'supabase/migrations';
  return readdirSync(join(root, directory)).filter((name) => name.endsWith('.sql')).sort().map((name) => {
    const file = `${directory}/${name}`;
    const sql = readFileSync(join(root, file), 'utf8');
    return { file, sql, sha256: sha256(sql) };
  });
}

export function verifyMigrationChain(root, expected) {
  const chain = loadMigrationChain(root);
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
