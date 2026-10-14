/**
 * Docs-consistency regression for the merged fix packs (Packs A/B/C/D-seam).
 *
 * `docs/security-source-remediation.md` §8 plus rows O-7/O-21/X-2 must
 * describe the already-merged work in past-tense completion language with
 * code/evidence references — not as "處理中/未完成" parallel work.
 * Numbering (O-1..O-23 / X-1..X-7 / S-1..S-5) must stay intact, and the exact
 * offline build env prefix must remain documented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const docPath = join(process.cwd(), 'docs/security-source-remediation.md');
const doc = readFileSync(docPath, 'utf8');

const section8 = doc.slice(doc.indexOf('## 8.'));

describe('security-source-remediation doc consistency', () => {
  it('keeps the O-1..O-23 finding numbers intact', () => {
    for (let n = 1; n <= 23; n += 1) {
      expect(doc, `missing O-${n}`).toContain(`| O-${n} `);
    }
  });

  it('keeps the X-1..X-7 and S-1..S-5 numbers intact', () => {
    for (let n = 1; n <= 7; n += 1) {
      expect(doc, `missing X-${n}`).toContain(`| X-${n} `);
    }
    for (let n = 1; n <= 5; n += 1) {
      expect(doc, `missing S-${n}`).toContain(`| S-${n} `);
    }
  });

  it('documents the exact offline build env prefix', () => {
    expect(doc).toContain(
      'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs',
    );
  });

  it('§8 records the merged packs as completed with source references', () => {
    expect(section8).toContain('已合併');
    expect(section8).toContain('beginLogout');
  });

  it('has no stale in-progress markers for the merged packs', () => {
    // Each phrase below described merged-pack work as unfinished in §8 or in
    // rows O-7/O-21/X-2. The rewrite removes them; other deferred/unverified
    // prose (R-ledger, §3 deferred/unverified lists) uses none of these.
    const stale = [
      '平行處理中',
      '處理中的未完成項目',
      '在它們合併前',
      '不預支它們的結果',
      '只設區域登出旗標',
      '拒絕也未處理',
      '在 try 之外',
      '無清單載入、就緒、錯誤的獨立區分',
      '待擁有 Pack',
    ];
    for (const phrase of stale) {
      expect(doc, `stale in-progress marker: ${phrase}`).not.toContain(phrase);
    }
  });
});
