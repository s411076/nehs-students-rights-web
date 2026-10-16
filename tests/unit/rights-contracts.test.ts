/**
 * Task 2 RED: proves missing validation / DTO / domain logic.
 * Covers all 13 action payloads, exact status/category sets, code-point
 * lengths, safe counts, sentinel stripping and exact-domain eligibility.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_ACTIONS,
  CONTROL_STATUSES,
  ENDPOINTS,
  GENERIC_MESSAGES,
  KNOWN_STATUSES,
  LIMITS,
  PROPOSAL_CATEGORIES,
  PUBLIC_STATUSES,
  REQUESTED_WITH_HEADER,
  RIGHTS_ACTIONS,
  STUDENT_ACTIONS,
  makeFailure,
  makeSuccess,
} from '@/lib/rights/contracts';
import {
  countCodePoints,
  fallbackFeedbackTitle,
  formatProposalTitle,
  parseActionRequest,
  validateBody,
  validateCategory,
  validateCommentContent,
  validateControlStatus,
  validateCount,
  validateId,
  validateIsAnonymous,
  validateProposalFinalTitle,
  validateRawTitle,
  validateReply,
  truncateToCodePoints,
} from '@/lib/rights/validation';
import { sendRightsAction } from '@/lib/rights/client';
import {
  COMMENT_SELECT,
  FEEDBACK_SELECT,
  HOME_SELECT,
  PROPOSAL_SELECT,
  applyPublicStatusFilter,
  buildPublicStatusFilter,
  isPublicStatus,
  toCommentDTO,
  toFeedbackAdminDTO,
  toFeedbackPublicDTO,
  toHomeSectionDTO,
  toProposalDTO,
} from '@/lib/rights/queries';
import {
  SCHOOL_EMAIL_DOMAIN,
  deriveDisplayName,
  getEmailDomain,
  isEligibleSchoolEmail,
  isSchoolEmail,
  normalizeEmail,
} from '@/lib/auth/types';

const C100 = '中'.repeat(100);
const C101 = '中'.repeat(101);
const E100 = '😀'.repeat(100);
const E101 = '😀'.repeat(101);

function validPayloads(): Array<{ action: string; payload: Record<string, unknown> }> {
  return [
    { action: 'createProposal', payload: { title: '圖書館建議', content: '希望延長開館', category: '環境與設備' } },
    { action: 'createFeedback', payload: { title: '建議', content: '希望改進', category: '其他', isAnonymous: false } },
    { action: 'addComment', payload: { proposalId: 'proposal-1', content: '支持', isAnonymous: true } },
    { action: 'setVoteCount', payload: { proposalId: 'proposal-1', count: 3 } },
    { action: 'updateProposalControl', payload: { id: 'proposal-1', status: '通過', reply: '收到' } },
    { action: 'approveProposal', payload: { id: 'proposal-1' } },
    { action: 'rejectProposal', payload: { id: 'proposal-1' } },
    { action: 'deleteProposal', payload: { id: 'proposal-1' } },
    { action: 'deleteComment', payload: { id: 'comment-1', proposalId: 'proposal-1' } },
    { action: 'saveFeedbackReply', payload: { id: 'feedback-1', reply: '謝謝建議' } },
    { action: 'deleteFeedback', payload: { id: 'feedback-1' } },
    { action: 'createHomeSection', payload: { title: '公告', content: '內容' } },
    { action: 'deleteHomeSection', payload: { id: 'section-1' } },
  ];
}

describe('rights contracts: action matrix', () => {
  it('exposes exactly 13 allowlisted actions (4 student + 9 admin)', () => {
    expect(STUDENT_ACTIONS).toHaveLength(4);
    expect(ADMIN_ACTIONS).toHaveLength(9);
    expect(RIGHTS_ACTIONS).toHaveLength(13);
    expect([...RIGHTS_ACTIONS].sort()).toEqual(
      [
        'createProposal', 'createFeedback', 'addComment', 'setVoteCount',
        'updateProposalControl', 'approveProposal', 'rejectProposal', 'deleteProposal',
        'deleteComment', 'saveFeedbackReply', 'deleteFeedback',
        'createHomeSection', 'deleteHomeSection',
      ].sort(),
    );
  });

  it('accepts every valid action payload', () => {
    for (const request of validPayloads()) {
      const result = parseActionRequest(request);
      expect(result.ok, JSON.stringify(request)).toBe(true);
    }
  });

  it('rejects unknown action, missing payload and malformed envelopes', () => {
    expect(parseActionRequest({ action: 'dropTable', payload: {} }).ok).toBe(false);
    expect(parseActionRequest({ action: 'approveProposal' }).ok).toBe(false);
    expect(parseActionRequest({ payload: { id: 'x' } }).ok).toBe(false);
    expect(parseActionRequest(null).ok).toBe(false);
    expect(parseActionRequest('approveProposal').ok).toBe(false);
    expect(parseActionRequest([]).ok).toBe(false);
  });

  it('rejects extra fields at envelope and payload level', () => {
    expect(
      parseActionRequest({ action: 'approveProposal', payload: { id: 'a' }, role: 'admin' }).ok,
    ).toBe(false);
    expect(parseActionRequest({ action: 'approveProposal', payload: { id: 'a', extra: 1 } }).ok).toBe(
      false,
    );
    expect(
      parseActionRequest({
        action: 'setVoteCount',
        payload: { proposalId: 'p', count: 1, status: '通過', reply: 'x' },
      }).ok,
    ).toBe(false);
    // Injected server-derived fields must not be accepted from the client.
    expect(
      parseActionRequest({
        action: 'createProposal',
        payload: { title: 't', content: 'c', category: '其他', status: '通過', upvotes_count: 99 },
      }).ok,
    ).toBe(false);
  });

  it('rejects wrong payload shapes per action', () => {
    expect(parseActionRequest({ action: 'approveProposal', payload: {} }).ok).toBe(false);
    expect(
      parseActionRequest({ action: 'deleteComment', payload: { id: 'c' } }).ok,
    ).toBe(false);
    expect(
      parseActionRequest({
        action: 'updateProposalControl',
        payload: { id: 'p', status: '通過' },
      }).ok,
    ).toBe(false);
    expect(
      parseActionRequest({ action: 'setVoteCount', payload: { proposalId: 'p' } }).ok,
    ).toBe(false);
  });
});

describe('rights contracts: status and category sets', () => {
  it('encodes exact public statuses, categories and endpoint paths', () => {
    expect([...PUBLIC_STATUSES]).toEqual(['研議中', '通過', '已採納', '不採納']);
    expect([...PROPOSAL_CATEGORIES]).toEqual(['環境與設備', '學聯與活動', '課程與教學', '其他']);
    expect(ENDPOINTS.ACTIONS).toBe('/api/rights/actions');
    expect(ENDPOINTS.FEEDBACK).toBe('/api/rights/feedback');
    expect(ENDPOINTS.PENDING).toBe('/api/rights/proposals/pending');
    expect(REQUESTED_WITH_HEADER).toBe('nehs-web');
    expect(LIMITS.RAW_TITLE_MAX).toBe(100);
    expect(LIMITS.PROPOSAL_TITLE_MAX).toBe(120);
    expect(LIMITS.BODY_MAX).toBe(5000);
    expect(LIMITS.COMMENT_MAX).toBe(1000);
    expect(LIMITS.ID_MAX).toBe(128);
  });

  it('excludes pending, rejected and unknown states from public and control sets', () => {
    expect([...PUBLIC_STATUSES]).not.toContain('待審核');
    expect([...PUBLIC_STATUSES]).not.toContain('被退回');
    expect([...CONTROL_STATUSES]).toEqual([...PUBLIC_STATUSES]);
    expect([...KNOWN_STATUSES]).toContain('待審核');
    expect(isPublicStatus('待審核')).toBe(false);
    expect(isPublicStatus('被退回')).toBe(false);
    expect(isPublicStatus('unknown')).toBe(false);
    expect(isPublicStatus('研議中')).toBe(true);
  });

  it('control payload rejects pending, rejected and unknown statuses', () => {
    expect(validateControlStatus('待審核').ok).toBe(false);
    expect(validateControlStatus('被退回').ok).toBe(false);
    expect(validateControlStatus('unknown').ok).toBe(false);
    expect(validateControlStatus('通過').ok).toBe(true);
    expect(
      parseActionRequest({
        action: 'updateProposalControl',
        payload: { id: 'p', status: '待審核', reply: '' },
      }).ok,
    ).toBe(false);
  });

  it('rejects unknown or malformed categories', () => {
    expect(validateCategory('其他').ok).toBe(true);
    expect(validateCategory('unknown').ok).toBe(false);
    expect(validateCategory('').ok).toBe(false);
    expect(validateCategory(123).ok).toBe(false);
  });
});

describe('rights validation: lengths count code points and reject', () => {
  it('counts emoji as one code point, not UTF-16 length', () => {
    expect(countCodePoints('😀')).toBe(1);
    expect(countCodePoints(E100)).toBe(100);
    expect('😀'.length).toBe(2); // guards the guard: UTF-16 would miscount
  });

  it('accepts boundary Chinese/emoji raw titles, rejects over-limit', () => {
    expect(validateRawTitle(C100).ok).toBe(true);
    expect(validateRawTitle(E100).ok).toBe(true);
    expect(validateRawTitle(C101).ok).toBe(false);
    expect(validateRawTitle(E101).ok).toBe(false);
    expect(validateRawTitle('x'.repeat(101)).ok).toBe(false);
  });

  it('rejects whitespace-only and non-string titles instead of truncating', () => {
    expect(validateRawTitle('   ').ok).toBe(false);
    expect(validateRawTitle('').ok).toBe(false);
    expect(validateRawTitle(123).ok).toBe(false);
    expect(validateRawTitle(null).ok).toBe(false);
    const over = validateRawTitle(C101);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.code).toBe('INVALID_PAYLOAD');
  });

  it('validates generated proposal titles up to 120 code points', () => {
    expect(validateProposalFinalTitle('中'.repeat(120)).ok).toBe(true);
    expect(validateProposalFinalTitle('中'.repeat(121)).ok).toBe(false);
    expect(validateProposalFinalTitle('😀'.repeat(120)).ok).toBe(true);
    expect(validateProposalFinalTitle('😀'.repeat(121)).ok).toBe(false);
  });

  it('preserves the raw category-prefix rule and validates the final title', () => {
    const prefixed = formatProposalTitle('圖書館建議', '環境與設備');
    expect(prefixed).toEqual({ ok: true, data: '[環境與設備] 圖書館建議' });
    const already = formatProposalTitle('[其他] 自訂標題', '其他');
    expect(already).toEqual({ ok: true, data: '[其他] 自訂標題' });
    expect(formatProposalTitle(C101, '其他').ok).toBe(false);
    expect(formatProposalTitle('   ', '其他').ok).toBe(false);
    expect(formatProposalTitle('標題', 'unknown').ok).toBe(false);
  });

  it('enforces body 5000, comment 1000 and reply-empty-allowed semantics', () => {
    expect(validateBody('中'.repeat(5000)).ok).toBe(true);
    expect(validateBody('中'.repeat(5001)).ok).toBe(false);
    expect(validateBody('  ').ok).toBe(false);
    expect(validateCommentContent('中'.repeat(1000)).ok).toBe(true);
    expect(validateCommentContent('中'.repeat(1001)).ok).toBe(false);
    expect(validateCommentContent('').ok).toBe(false);
    expect(validateReply('').ok).toBe(true);
    expect(validateReply('中'.repeat(5000)).ok).toBe(true);
    expect(validateReply('中'.repeat(5001)).ok).toBe(false);
    expect(validateReply(42).ok).toBe(false);
  });
});

describe('rights validation: IDs and counts', () => {
  it('accepts non-UUID fixture IDs but rejects malformed IDs', () => {
    expect(validateId('proposal-1').ok).toBe(true);
    expect(validateId('a'.repeat(128)).ok).toBe(true);
    expect(validateId('a'.repeat(129)).ok).toBe(false);
    expect(validateId('').ok).toBe(false);
    expect(validateId('   ').ok).toBe(false);
    expect(validateId(123).ok).toBe(false);
    expect(validateId(null).ok).toBe(false);
    expect(validateId(undefined).ok).toBe(false);
  });

  it('accepts zero and safe integers, rejects NaN/float/negative/unsafe', () => {
    expect(validateCount(0)).toEqual({ ok: true, data: 0 });
    expect(validateCount(42).ok).toBe(true);
    expect(validateCount(Number.MAX_SAFE_INTEGER).ok).toBe(true);
    expect(validateCount(-1).ok).toBe(false);
    expect(validateCount(1.5).ok).toBe(false);
    expect(validateCount(NaN).ok).toBe(false);
    expect(validateCount(Infinity).ok).toBe(false);
    expect(validateCount(Number.MAX_SAFE_INTEGER + 1).ok).toBe(false);
    expect(validateCount('3').ok).toBe(false);
    expect(validateCount(null).ok).toBe(false);
  });

  it('requires strict booleans for anonymity flags', () => {
    expect(validateIsAnonymous(true)).toEqual({ ok: true, data: true });
    expect(validateIsAnonymous(false)).toEqual({ ok: true, data: false });
    expect(validateIsAnonymous('true').ok).toBe(false);
    expect(validateIsAnonymous(1).ok).toBe(false);
    expect(validateIsAnonymous(undefined).ok).toBe(false);
  });
});

describe('auth types: exact school-domain eligibility', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(SCHOOL_EMAIL_DOMAIN).toBe('nehs.hc.edu.tw');
    expect(normalizeEmail('  Student@NEHS.HC.EDU.TW ')).toBe('student@nehs.hc.edu.tw');
    expect(getEmailDomain('a@nehs.hc.edu.tw')).toBe('nehs.hc.edu.tw');
  });

  it('rejects lookalike domains and unconfirmed accounts', () => {
    expect(isSchoolEmail('student@nehs.hc.edu.tw')).toBe(true);
    expect(isSchoolEmail('user@nehs.hc.edu.tw.evil.test')).toBe(false);
    expect(isSchoolEmail('user@evil-nehs.hc.edu.tw')).toBe(false);
    expect(isSchoolEmail('user@example.test')).toBe(false);
    expect(isSchoolEmail('not-an-email')).toBe(false);
    expect(isSchoolEmail(null)).toBe(false);
    expect(isEligibleSchoolEmail('student@nehs.hc.edu.tw', '2026-01-01T00:00:00Z')).toBe(true);
    expect(isEligibleSchoolEmail('student@nehs.hc.edu.tw', null)).toBe(false);
    expect(isEligibleSchoolEmail('student@nehs.hc.edu.tw', undefined)).toBe(false);
    expect(isEligibleSchoolEmail('user@nehs.hc.edu.tw.evil.test', '2026-01-01T00:00:00Z')).toBe(
      false,
    );
  });

  it('derives display names without trusting arbitrary claims', () => {
    expect(deriveDisplayName({ name: '王小明', email: 'wm@nehs.hc.edu.tw' })).toBe('王小明');
    expect(deriveDisplayName({ email: 'wm@nehs.hc.edu.tw' })).toBe('wm');
    expect(deriveDisplayName({})).toBe('已登入學生');
  });
});

describe('rights queries: explicit selects and DTO picking', () => {
  const proposalRow = {
    id: 'proposal-1', title: 'Fixture 研議中', content: 'Fixture proposal', status: '研議中',
    author_name: 'Fixture student', upvotes_count: 0, reply: '',
    created_at: '2026-01-01T00:00:00Z', secret: 'PRIVATE_SENTINEL', author_id: 'uuid-invented',
  };

  it('declares exact select constants without invented columns', () => {
    expect([...PROPOSAL_SELECT]).toEqual([
      'id', 'title', 'content', 'author_name', 'status', 'upvotes_count', 'reply', 'created_at',
    ]);
    expect([...FEEDBACK_SELECT]).toEqual([
      'id', 'title', 'content', 'category', 'is_anonymous',
      'author_name', 'reply', 'replied_at', 'created_at',
    ]);
    expect([...COMMENT_SELECT]).toEqual(['id', 'proposal_id', 'content', 'author_name', 'created_at']);
    expect([...HOME_SELECT]).toEqual(['id', 'title', 'content', 'created_at']);
    for (const list of [PROPOSAL_SELECT, FEEDBACK_SELECT, COMMENT_SELECT, HOME_SELECT]) {
      expect(list).not.toContain('author_id');
      expect(list).not.toContain('updated_at');
      expect(list).not.toContain('user_id');
    }
  });

  it('drops sentinel secrets and invented UUID columns on serialization', () => {
    const dto = toProposalDTO(proposalRow);
    expect(dto).not.toBeNull();
    expect(dto).not.toHaveProperty('secret');
    expect(dto).not.toHaveProperty('author_id');
    expect(JSON.stringify(dto)).not.toContain('PRIVATE_SENTINEL');
    expect(Object.keys(dto as object).sort()).toEqual([...PROPOSAL_SELECT].sort());
  });

  it('omits author_name for anonymous public feedback', () => {
    const anonymous = toFeedbackPublicDTO({
      id: 'feedback-1', title: 't', content: 'c', category: '其他', is_anonymous: true,
      author_name: 'ANONYMOUS_AUTHOR_SENTINEL', reply: '', replied_at: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    expect(anonymous).not.toBeNull();
    expect(anonymous).not.toHaveProperty('author_name');
    expect(JSON.stringify(anonymous)).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
    const named = toFeedbackPublicDTO({
      id: 'feedback-2', title: 't', content: 'c', category: '其他', is_anonymous: false,
      author_name: '王小明', reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z',
    });
    expect(named?.author_name).toBe('王小明');
    // Admin DTO keeps the author but stays guarded behind server checks.
    const admin = toFeedbackAdminDTO({
      id: 'feedback-1', title: 't', content: 'c', category: '其他', is_anonymous: true,
      author_name: 'ANONYMOUS_AUTHOR_SENTINEL', reply: '', replied_at: null,
      created_at: '2026-01-01T00:00:00Z', secret: 'PRIVATE_SENTINEL',
    });
    expect(admin?.author_name).toBe('ANONYMOUS_AUTHOR_SENTINEL');
    expect(admin).not.toHaveProperty('secret');
  });

  it('excludes unknown statuses and picks comment/home fields exactly', () => {
    expect(toProposalDTO({ ...proposalRow, status: 'unknown' })).toBeNull();
    expect(toProposalDTO({ ...proposalRow, status: '待審核' })).not.toBeNull();
    const comment = toCommentDTO({
      id: 'comment-1', proposal_id: 'proposal-1', content: 'hi',
      author_name: 's', created_at: '2026-01-01T00:00:00Z', extra: 1,
    });
    expect(comment).not.toBeNull();
    expect(Object.keys(comment as object).sort()).toEqual([...COMMENT_SELECT].sort());
    const home = toHomeSectionDTO({
      id: 'section-1', title: 't', content: 'c',
      created_at: '2026-01-01T00:00:00Z', status: '研議中',
    });
    expect(home).not.toBeNull();
    expect(Object.keys(home as object).sort()).toEqual([...HOME_SELECT].sort());
    expect(toProposalDTO(null)).toBeNull();
    expect(toCommentDTO('nope')).toBeNull();
  });

  it('shares one PUBLIC_STATUSES builder for home and list queries', () => {
    const filter = buildPublicStatusFilter();
    expect(filter).toEqual({ column: 'status', values: ['研議中', '通過', '已採納', '不採納'] });
    const calls: Array<{ column: string; values: string[] }> = [];
    const fakeQuery = {
      in(column: string, values: string[]) {
        calls.push({ column, values });
        return 'filtered';
      },
    };
    expect(applyPublicStatusFilter(fakeQuery)).toBe('filtered');
    expect(calls).toEqual([{ column: 'status', values: ['研議中', '通過', '已採納', '不採納'] }]);
  });
});

describe('rights results: typed union with generic Traditional Chinese messages', () => {
  it('builds success and failure shapes without leaking details', () => {
    expect(makeSuccess({ id: 'proposal-1' })).toEqual({ ok: true, data: { id: 'proposal-1' } });
    const failure = makeFailure('INVALID_PAYLOAD');
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.code).toBe('INVALID_PAYLOAD');
      expect(typeof failure.message).toBe('string');
      expect(failure.message.length).toBeGreaterThan(0);
    }
    for (const message of Object.values(GENERIC_MESSAGES)) {
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('PRIVATE_SENTINEL');
    }
    const parsed = parseActionRequest({ action: 'approveProposal', payload: {} });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.code).toBe('INVALID_PAYLOAD');
      expect(parsed.message).toBe(GENERIC_MESSAGES.INVALID_PAYLOAD);
    }
  });
});

describe('feedback fallback title: code-point-safe truncation', () => {
  it('never splits surrogate pairs when deriving titles from emoji content', () => {
    const content = '🏫'.repeat(20);
    expect(content.slice(0, 15)).not.toBe('🏫'.repeat(15)); // UTF-16 slice splits the 8th pair
    const title = fallbackFeedbackTitle('', content);
    expect(title).toBe(`${'🏫'.repeat(15)}...`);
    expect(Array.from(title.slice(0, -3))).toHaveLength(15);
    expect(() => encodeURIComponent(title)).not.toThrow(); // throws on lone surrogates
  });

  it('keeps short content whole and preserves provided titles', () => {
    expect(fallbackFeedbackTitle('', 'short content')).toBe('short content');
    expect(fallbackFeedbackTitle('', '中'.repeat(15))).toBe('中'.repeat(15));
    expect(fallbackFeedbackTitle('', '中'.repeat(16))).toBe(`${'中'.repeat(15)}...`);
    expect(fallbackFeedbackTitle('provided', '🏫'.repeat(20))).toBe('provided');
    expect(truncateToCodePoints('🏫'.repeat(20), 15)).toBe('🏫'.repeat(15));
  });
});

describe('rights client: definitive rejections pass through, ambiguous collapses', () => {
  const feedback = {
    action: 'createFeedback',
    payload: { title: '', content: 'hi', category: '其他', isAnonymous: true },
  } as const;

  it('preserves 403 FORBIDDEN and 409 CONFLICT instead of collapsing to unknown', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 })));
    await expect(sendRightsAction(feedback)).resolves.toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const conflict = await sendRightsAction(feedback);
    expect(conflict).toMatchObject({ ok: false, code: 'CONFLICT' });
    if (!conflict.ok && conflict.code === 'CONFLICT') {
      expect(conflict.message).toBe(GENERIC_MESSAGES.CONFLICT);
      expect(JSON.stringify(conflict)).not.toContain('SELECT');
    } else {
      expect.unreachable('expected a CONFLICT failure');
    }
  });

  it('collapses 503 UNAVAILABLE and transport failures to OUTCOME_UNKNOWN', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('connection lost')));
    await expect(sendRightsAction(feedback)).resolves.toMatchObject({ ok: false, code: 'OUTCOME_UNKNOWN' });
    await expect(sendRightsAction(feedback)).resolves.toMatchObject({ ok: false, code: 'OUTCOME_UNKNOWN' });
  });
});
