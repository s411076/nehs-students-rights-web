import { describe, expect, it, vi } from 'vitest';
import { ADMIN_ACTIONS, PUBLIC_STATUSES, PROPOSAL_CATEGORIES, RIGHTS_ACTIONS, STUDENT_ACTIONS, GENERIC_MESSAGES } from '@/lib/rights/contracts';
import { countCodePoints, fallbackFeedbackTitle, formatProposalTitle, parseActionRequest, validateBody, validateCategory,
  validateCommentContent, validateControlStatus, validateCount, validateId, validateIsAnonymous,
  validateProposalFinalTitle, validateRawTitle, validateReply, truncateToCodePoints } from '@/lib/rights/validation';
import { sendRightsAction } from '@/lib/rights/client';
import { parseCursor, parsePage, parsePageParameters, pagePath } from '@/lib/rights/pagination';
import { parseMutationReceipt } from '@/lib/rights/receipts';
import { toProposalDTO, toFeedbackPublicDTO, toFeedbackAdminDTO, toCommentDTO, toHomeSectionDTO, isPublicStatus } from '@/lib/rights/queries';
import { deriveDisplayName, isEligibleSchoolEmail, isSchoolEmail, normalizeEmail } from '@/lib/auth/types';

const payloads = [
  { action: 'createProposal', payload: { title: 'title', content: 'body', category: '其他' } },
  { action: 'createFeedback', payload: { title: '', content: 'body', category: '其他', isAnonymous: true } },
  { action: 'addComment', payload: { proposalId: 'proposal-1', content: 'body', isAnonymous: false } },
  { action: 'setVote', payload: { proposalId: 'proposal-1', voted: true } },
  { action: 'updateProposalControl', payload: { id: 'p', expectedVersion: 1, status: '處理中', reply: '' } },
  { action: 'approveProposal', payload: { id: 'p', expectedVersion: 1 } },
  { action: 'rejectProposal', payload: { id: 'p', expectedVersion: 1 } },
  { action: 'deleteProposal', payload: { id: 'p', expectedVersion: 1 } },
  { action: 'deleteComment', payload: { id: 'c', proposalId: 'p', expectedVersion: 1 } },
  { action: 'saveFeedbackReply', payload: { id: 'f', expectedVersion: 1, reply: '' } },
  { action: 'deleteFeedback', payload: { id: 'f', expectedVersion: 1 } },
  { action: 'createHomeSection', payload: { title: 'title', content: 'body' } },
  { action: 'deleteHomeSection', payload: { id: 'h', expectedVersion: 1 } },
];
describe('strict action boundary', () => {
  it.each(payloads)('parses $action when exact payload is supplied', request => {
    expect(parseActionRequest(request)).toEqual({ ok: true, data: request });
  });
  it.each(payloads)('rejects $action when fields are injected', request => {
    expect(parseActionRequest({ ...request, payload: { ...request.payload, author_id: 'forged' } }).ok).toBe(false);
  });
  it.each(payloads.filter(request => 'expectedVersion' in request.payload))('requires version for $action', request => {
    const payload = Object.fromEntries(Object.entries(request.payload).filter(([key]) => key !== 'expectedVersion'));
    expect(parseActionRequest({ ...request, payload }).ok).toBe(false);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null])('rejects unsafe version %s', expectedVersion => {
    expect(parseActionRequest({ action: 'deleteProposal', payload: { id: 'p', expectedVersion } }).ok).toBe(false);
  });
  it.each([null, [], 'approveProposal', {}, { action: 'unknown', payload: {} },
    { action: 'setVoteCount', payload: { proposalId: 'p', count: 1 } },
    { action: 'setVote', payload: { proposalId: 'p', voted: 1 } },
    { action: 'approveProposal', payload: { id: 'p', expectedVersion: 1 }, role: 'admin' }])('rejects malformed envelope %j', input => {
    expect(parseActionRequest(input).ok).toBe(false);
  });
  it('has four student and nine admin actions with no total-write compatibility', () => {
    expect(STUDENT_ACTIONS).toHaveLength(4); expect(ADMIN_ACTIONS).toHaveLength(9);
    expect(RIGHTS_ACTIONS).toHaveLength(13); expect(RIGHTS_ACTIONS).not.toContain('setVoteCount');
  });
});
describe('Unicode-safe validation', () => {
  it.each([validateRawTitle, validateBody, validateCommentContent])('rejects empty inputs', validate => {
    expect(validate('  ').ok).toBe(false); expect(validate(123).ok).toBe(false);
  });
  it.each([
    { validate: validateRawTitle, max: 100 }, { validate: validateProposalFinalTitle, max: 120 },
    { validate: validateBody, max: 5000 }, { validate: validateCommentContent, max: 1000 }, { validate: validateReply, max: 5000 },
  ])('enforces code point limit $max', ({ validate, max }) => {
    expect(validate('🏫'.repeat(max)).ok).toBe(true); expect(validate('🏫'.repeat(max + 1)).ok).toBe(false);
  });
  it('permits reply clearing and preserves title rules', () => {
    expect(validateReply('').ok).toBe(true); expect(countCodePoints('🏫')).toBe(1);
    expect(formatProposalTitle('圖書館', '其他')).toEqual({ ok: true, data: '[其他] 圖書館' });
    expect(formatProposalTitle('[其他] 圖書館', '其他')).toEqual({ ok: true, data: '[其他] 圖書館' });
    expect(fallbackFeedbackTitle('', '🏫'.repeat(20))).toBe(`${'🏫'.repeat(15)}...`);
    expect(fallbackFeedbackTitle('', 'short')).toBe('short'); expect(fallbackFeedbackTitle('given', 'body')).toBe('given');
    expect(truncateToCodePoints('🏫'.repeat(20), 15)).toBe('🏫'.repeat(15));
  });
  it.each(['待審核', '被退回', 'unknown'])('excludes %s from public/control statuses', status => {
    expect(isPublicStatus(status)).toBe(false); expect(validateControlStatus(status).ok).toBe(false);
  });
  it('accepts only configured categories and statuses', () => {
    for (const category of PROPOSAL_CATEGORIES) expect(validateCategory(category).ok).toBe(true);
    for (const status of PUBLIC_STATUSES) expect(validateControlStatus(status).ok).toBe(true);
    expect(validateCategory('unknown').ok).toBe(false);
  });
  it.each(['', ' ', 'a'.repeat(129), 123, null, undefined])('rejects malformed bounded ID %s', id => {
    expect(validateId(id).ok).toBe(false);
  });
  it('accepts bounded fixture IDs without claiming UUID validation', () => {
    expect(validateId('proposal-1').ok).toBe(true); expect(validateId('a'.repeat(128)).ok).toBe(true);
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, '3', null])('rejects unsafe counts %s', count => {
    expect(validateCount(count).ok).toBe(false);
  });
  it('requires booleans and accepts safe count bounds', () => {
    expect(validateIsAnonymous(true).ok).toBe(true); expect(validateIsAnonymous('true').ok).toBe(false);
    expect(validateCount(0).ok).toBe(true); expect(validateCount(Number.MAX_SAFE_INTEGER).ok).toBe(true);
  });
});
const base = { id: 'p', title: 't', content: 'c', created_at: '2026-01-01T00:00:00.123456Z', version: 1 };
const proposal = { ...base, author_name: 'student', status: '處理中', upvotes_count: 7, legacy_upvotes_count: 6, viewer_voted: true, reply: '' };
const feedback = { ...base, category: '其他', is_anonymous: true, reply: '', replied_at: null, author_name: 'PRIVATE_AUTHOR' };
describe('projected DTOs', () => {
  it('drops private fields rather than forwarding RPC objects', () => {
    expect(toProposalDTO({ ...proposal, author_id: 'PRIVATE', email: 'PRIVATE' })).toEqual(proposal);
    expect(toHomeSectionDTO({ ...base, user_id: 'PRIVATE' })).toEqual(base);
  });
  it.each([toFeedbackPublicDTO, toFeedbackAdminDTO])('redacts anonymous feedback even for admin lists', parse => {
    const dto = parse({ ...feedback, user_id: 'PRIVATE' });
    expect(dto).not.toBeNull(); expect(dto).not.toHaveProperty('author_name');
    expect(JSON.stringify(dto)).not.toContain('PRIVATE');
  });
  it('keeps nonanonymous display names without private identities', () => {
    expect(toFeedbackPublicDTO({ ...feedback, is_anonymous: false, author_name: 'student' })?.author_name).toBe('student');
  });
  it('replaces anonymous comment attribution with display label', () => {
    expect(toCommentDTO({ ...base, proposal_id: 'p', author_name: 'PRIVATE', is_anonymous: true })?.author_name).toBe('匿名學生');
  });
  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid DTO version %s', version => {
    expect(toProposalDTO({ ...proposal, version })).toBeNull();
    expect(toFeedbackPublicDTO({ ...feedback, version })).toBeNull();
    expect(toHomeSectionDTO({ ...base, version })).toBeNull();
  });
  it('rejects missing voting fields and unknown statuses', () => {
    expect(toProposalDTO({ ...proposal, viewer_voted: undefined })).toBeNull();
    expect(toProposalDTO({ ...proposal, status: 'unknown' })).toBeNull();
  });
});
describe('pagination boundary', () => {
  const cursor = { created_at: base.created_at, id: 'p' };
  it('preserves microseconds through URL and page parsing', () => {
    const params = new URL(pagePath('/proposals', { cursor, query: '🏫', limit: 50 }), 'http://localhost').searchParams;
    expect(parsePageParameters(params)).toEqual({ ok: true, data: { p_limit: 50, p_cursor: cursor, p_query: '🏫' } });
    expect(parsePage({ items: [proposal], nextCursor: cursor }, toProposalDTO)).toEqual({ items: [proposal], nextCursor: cursor });
  });
  it('defaults to twenty rows without cursor or query', () => {
    expect(parsePageParameters(new URLSearchParams())).toEqual({ ok: true, data: { p_limit: 20, p_cursor: null, p_query: '' } });
  });
  it.each(['limit=0', 'limit=51', 'limit=1.5', 'limit=1&limit=2', 'cursor=null', 'cursor={', 'cursor={"id":"p"}', `query=${'🏫'.repeat(101)}`])('rejects malformed page parameters %s', query => {
    expect(parsePageParameters(new URLSearchParams(query)).ok).toBe(false);
  });
  it('rejects arrays and malformed items rather than silently dropping them', () => {
    expect(parsePage([proposal], toProposalDTO)).toBeNull();
    expect(parsePage({ items: [proposal, {}], nextCursor: null }, toProposalDTO)).toBeNull();
    expect(parseCursor({ ...cursor, created_at: 'not-a-date' })).toBeNull();
    expect(parseCursor({ ...cursor, created_at: '2026-02-30T00:00:00.123456Z' })).toBeNull();
    expect(parseCursor({ ...cursor, created_at: '2026-01-01T24:00:00Z' })).toBeNull();
  });
});
describe('receipt and client failures', () => {
  const request = { action: 'createProposal', payload: { title: 't', content: 'c', category: '其他' } } as const;
  it('rejects success receipts with extra keys or missing versions', () => {
    expect(parseMutationReceipt({ inserted: true }, request)).toBeNull();
    expect(parseMutationReceipt({ id: 'p', inserted: true, version: 1, secret: 'PRIVATE' }, request)).toBeNull();
  });
  it.each([['FORBIDDEN', 403], ['CONFLICT', 409]] as const)('preserves definitive %s', async (code, status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, code, message: 'PRIVATE' }, { status })));
    expect(await sendRightsAction(request)).toEqual({ ok: false, code, message: GENERIC_MESSAGES[code] });
  });
  it('marks malformed successful receipts uncertain without refresh or retry', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { inserted: true } }));
    vi.stubGlobal('fetch', fetcher);
    const refresh = vi.fn();
    expect(await sendRightsAction(request, refresh)).toMatchObject({ ok: false, code: 'OUTCOME_UNKNOWN' });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(refresh).not.toHaveBeenCalled();
  });
  it('keeps unavailable/transport failures ambiguous', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 })).mockRejectedValueOnce(new TypeError('lost')));
    expect(await sendRightsAction(request)).toMatchObject({ code: 'OUTCOME_UNKNOWN' });
    expect(await sendRightsAction(request)).toMatchObject({ code: 'OUTCOME_UNKNOWN' });
  });
});
describe('identity helpers', () => {
  it('normalizes eligible school identities and refuses lookalike/unconfirmed accounts', () => {
    expect(normalizeEmail(' Student@NEHS.HC.EDU.TW ')).toBe('student@nehs.hc.edu.tw');
    expect(isEligibleSchoolEmail('student@nehs.hc.edu.tw', '2026-01-01')).toBe(true);
    expect(isEligibleSchoolEmail('student@nehs.hc.edu.tw', null)).toBe(false);
    expect(isSchoolEmail('student@nehs.hc.edu.tw.evil.test')).toBe(false);
    expect(deriveDisplayName({ email: 'student@nehs.hc.edu.tw' })).toBe('student');
  });
});
