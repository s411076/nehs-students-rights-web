import { describe, expect, it } from 'vitest';
import { parseQueuePage, parseQueueParameters, queuePath, RIGHTS_QUEUE_PATH } from '@/lib/rights/queues';

const params = (query: string) => new URLSearchParams(query);
const item = (value: unknown) => (typeof value === 'string' ? value : null);

describe('queue parameter boundary', () => {
  it.each([
    ['kind=feedback&filter=all', 'feedback', 'all'],
    ['kind=feedback&filter=awaiting', 'feedback', 'awaiting'],
    ['kind=feedback&filter=replied', 'feedback', 'replied'],
    ['kind=proposal&filter=all', 'proposal', 'all'],
    ['kind=proposal&filter=processing', 'proposal', 'processing'],
    ['kind=proposal&filter=closed', 'proposal', 'closed'],
    ['kind=pending&filter=pending', 'pending', 'pending'],
  ])('accepts %s', (query, kind, filter) => {
    const parsed = parseQueueParameters(params(query));
    expect(parsed).toEqual({ ok: true, data: { p_kind: kind, p_filter: filter, p_limit: 20, p_cursor: null, p_query: '' } });
  });
  it.each([
    'filter=all',
    'kind=feedback',
    'kind=unknown&filter=all',
    'kind=feedback&filter=unknown',
    'kind=feedback&filter=processing',
    'kind=feedback&filter=closed',
    'kind=feedback&filter=pending',
    'kind=proposal&filter=awaiting',
    'kind=proposal&filter=replied',
    'kind=proposal&filter=pending',
    'kind=pending&filter=all',
    'kind=pending&filter=awaiting',
    'kind=feedback&kind=proposal&filter=all',
    'kind=feedback&filter=all&filter=replied',
    'kind=feedback&filter=all&limit=20&limit=7',
    'kind=feedback&filter=all&cursor=null&cursor=null',
    'kind=feedback&filter=all&query=a&query=b',
    'kind=feedback&filter=all&sort=asc',
    'kind=feedback&filter=all&limit=0',
    'kind=feedback&filter=all&limit=51',
    'kind=feedback&filter=all&limit=abc',
    'kind=feedback&filter=all&limit=1.5',
    `kind=feedback&filter=all&query=${'x'.repeat(101)}`,
    'kind=feedback&filter=all&cursor=null',
    'kind=feedback&filter=all&cursor=%7B%7D',
    'kind=feedback&filter=all&cursor=not-json',
  ])('rejects %s', query => {
    expect(parseQueueParameters(params(query)).ok).toBe(false);
  });
  it('keeps microsecond cursor precision and query bounds', () => {
    const cursor = encodeURIComponent(JSON.stringify({ created_at: '2026-03-02T00:00:00.123456Z', id: 'feedback-1' }));
    const parsed = parseQueueParameters(params(`kind=feedback&filter=awaiting&limit=7&cursor=${cursor}&query=needle`));
    expect(parsed).toEqual({ ok: true, data: { p_kind: 'feedback', p_filter: 'awaiting', p_limit: 7,
      p_cursor: { created_at: '2026-03-02T00:00:00.123456Z', id: 'feedback-1' }, p_query: 'needle' } });
  });
});

describe('queue page envelope', () => {
  it('requires total to equal counts for the selected filter', () => {
    const page = parseQueuePage({ items: ['a'], nextCursor: null, total: 2,
      counts: { all: 2, awaiting: 1, replied: 1 } }, item, 'feedback', 'all');
    expect(page).toEqual({ items: ['a'], nextCursor: null, total: 2, counts: { all: 2, awaiting: 1, replied: 1 } });
  });
  it.each([
    ['missing total', { items: [], nextCursor: null, counts: { all: 0, awaiting: 0, replied: 0 } }, 'feedback', 'all'],
    ['total mismatch', { items: [], nextCursor: null, total: 1, counts: { all: 2, awaiting: 1, replied: 1 } }, 'feedback', 'all'],
    ['missing key', { items: [], nextCursor: null, total: 1, counts: { all: 1, awaiting: 1 } }, 'feedback', 'all'],
    ['extra key', { items: [], nextCursor: null, total: 1, counts: { all: 1, awaiting: 1, replied: 0, other: 0 } }, 'feedback', 'all'],
    ['wrong kind keys', { items: [], nextCursor: null, total: 1, counts: { all: 1, processing: 1, closed: 0 } }, 'feedback', 'all'],
    ['unsafe count', { items: [], nextCursor: null, total: 1, counts: { all: 1, awaiting: 0, replied: 1.5 } }, 'feedback', 'all'],
    ['negative count', { items: [], nextCursor: null, total: 1, counts: { pending: -1 } }, 'pending', 'pending'],
    ['inconsistent counts', { items: [], nextCursor: null, total: 3, counts: { all: 3, awaiting: 1, replied: 1 } }, 'feedback', 'all'],
    ['bad item', { items: [42], nextCursor: null, total: 1, counts: { pending: 1 } }, 'pending', 'pending'],
    ['bad cursor', { items: [], nextCursor: { id: 'x' }, total: 0, counts: { pending: 0 } }, 'pending', 'pending'],
  ] as const)('rejects %s', (_label, value, kind, filter) => {
    expect(parseQueuePage(value, item, kind, filter)).toBe(null);
  });
  it('accepts the pending singleton counts shape', () => {
    expect(parseQueuePage({ items: [], nextCursor: null, total: 3, counts: { pending: 3 } }, item, 'pending', 'pending'))
      .toEqual({ items: [], nextCursor: null, total: 3, counts: { pending: 3 } });
  });
});

describe('queue path builder', () => {
  it('round-trips through the parameter parser', () => {
    const path = queuePath(undefined, { kind: 'proposal', filter: 'processing', limit: 7, query: 'needle' });
    expect(path.startsWith(`${RIGHTS_QUEUE_PATH}?`)).toBe(true);
    const parsed = parseQueueParameters(new URLSearchParams(path.split('?')[1]));
    expect(parsed).toEqual({ ok: true, data: { p_kind: 'proposal', p_filter: 'processing', p_limit: 7, p_cursor: null, p_query: 'needle' } });
  });
});
