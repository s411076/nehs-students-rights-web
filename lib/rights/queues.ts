import { makeFailure, makeSuccess, type RightsResult } from './contracts';
import { parseCursor, type PageCursor } from './pagination';
import { isSafeCount } from './queries';
import { countCodePoints } from './validation';

export const RIGHTS_QUEUE_PATH = '/api/rights/queue';

export const QUEUE_KINDS = ['feedback', 'proposal', 'pending'] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const FEEDBACK_QUEUE_FILTERS = ['all', 'awaiting', 'replied'] as const;
export type FeedbackQueueFilter = (typeof FEEDBACK_QUEUE_FILTERS)[number];
export const PROPOSAL_QUEUE_FILTERS = ['all', 'processing', 'closed'] as const;
export type ProposalQueueFilter = (typeof PROPOSAL_QUEUE_FILTERS)[number];
export const PENDING_QUEUE_FILTERS = ['pending'] as const;
export type PendingQueueFilter = (typeof PENDING_QUEUE_FILTERS)[number];
export type QueueFilter = FeedbackQueueFilter | ProposalQueueFilter | PendingQueueFilter;

export type FeedbackQueueCounts = { readonly all: number; readonly awaiting: number; readonly replied: number };
export type ProposalQueueCounts = { readonly all: number; readonly processing: number; readonly closed: number };
export type PendingQueueCounts = { readonly pending: number };
export type QueueCounts = FeedbackQueueCounts | ProposalQueueCounts | PendingQueueCounts;

export type QueuePage<T> = {
  readonly items: T[];
  readonly nextCursor: PageCursor | null;
  readonly total: number;
  readonly counts: QueueCounts;
};

export type QueueParameters = {
  readonly p_kind: QueueKind;
  readonly p_filter: QueueFilter;
  readonly p_limit: number;
  readonly p_cursor: PageCursor | null;
  readonly p_query: string;
};

const QUEUE_PARAM_KEYS = ['kind', 'filter', 'limit', 'cursor', 'query'] as const;

function filtersFor(kind: QueueKind): readonly QueueFilter[] {
  switch (kind) {
    case 'feedback': return FEEDBACK_QUEUE_FILTERS;
    case 'proposal': return PROPOSAL_QUEUE_FILTERS;
    case 'pending': return PENDING_QUEUE_FILTERS;
  }
}

function countsKeys(kind: QueueKind): string {
  return [...filtersFor(kind)].sort().join(',');
}

export function parseQueueParameters(params: URLSearchParams): RightsResult<QueueParameters> {
  for (const key of QUEUE_PARAM_KEYS) {
    if (params.getAll(key).length > 1) return makeFailure('INVALID_PAYLOAD');
  }
  for (const key of Array.from(new Set(params.keys()))) {
    if (!QUEUE_PARAM_KEYS.some(allowed => allowed === key)) return makeFailure('INVALID_PAYLOAD');
  }
  const rawKind = params.get('kind');
  const kind = QUEUE_KINDS.find(entry => entry === rawKind);
  if (kind === undefined) return makeFailure('INVALID_PAYLOAD');
  const rawFilter = params.get('filter');
  const p_filter = filtersFor(kind).find(filter => filter === rawFilter);
  if (p_filter === undefined) return makeFailure('INVALID_PAYLOAD');
  const rawLimit = params.get('limit');
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) return makeFailure('INVALID_PAYLOAD');
  const p_limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isSafeInteger(p_limit) || p_limit < 1 || p_limit > 50) return makeFailure('INVALID_PAYLOAD');
  const p_query = params.get('query') ?? '';
  if (countCodePoints(p_query) > 100) return makeFailure('INVALID_PAYLOAD');
  let p_cursor: PageCursor | null = null;
  const rawCursor = params.get('cursor');
  if (rawCursor !== null) {
    try { p_cursor = parseCursor(JSON.parse(rawCursor)); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (p_cursor === null) return makeFailure('INVALID_PAYLOAD');
  }
  return makeSuccess({ p_kind: kind, p_filter, p_limit, p_cursor, p_query });
}

function parseCounts(value: unknown, kind: QueueKind): QueueCounts | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join(',') !== countsKeys(kind)) return null;
  switch (kind) {
    case 'feedback':
      if ('all' in value && 'awaiting' in value && 'replied' in value &&
          isSafeCount(value.all) && isSafeCount(value.awaiting) && isSafeCount(value.replied) &&
          value.all === value.awaiting + value.replied) {
        return { all: value.all, awaiting: value.awaiting, replied: value.replied };
      }
      return null;
    case 'proposal':
      if ('all' in value && 'processing' in value && 'closed' in value &&
          isSafeCount(value.all) && isSafeCount(value.processing) && isSafeCount(value.closed) &&
          value.all === value.processing + value.closed) {
        return { all: value.all, processing: value.processing, closed: value.closed };
      }
      return null;
    case 'pending':
      return 'pending' in value && isSafeCount(value.pending) ? { pending: value.pending } : null;
  }
}

export function parseQueuePage<T>(
  value: unknown,
  itemParser: (item: unknown) => T | null,
  kind: QueueKind,
  filter: QueueFilter,
): QueuePage<T> | null {
  if (typeof value !== 'object' || value === null || !('items' in value) || !('nextCursor' in value) ||
      !('total' in value) || !('counts' in value) || !Array.isArray(value.items)) return null;
  const cursor = value.nextCursor === null ? null : parseCursor(value.nextCursor);
  if (value.nextCursor !== null && cursor === null) return null;
  if (!isSafeCount(value.total)) return null;
  const counts = parseCounts(value.counts, kind);
  if (counts === null) return null;
  if (Object.entries(counts).find(([key]) => key === filter)?.[1] !== value.total) return null;
  const items: T[] = [];
  for (const item of value.items) {
    const parsed = itemParser(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return { items, nextCursor: cursor, total: value.total, counts };
}

export type QueuePathOptions = {
  readonly kind: QueueKind;
  readonly filter: QueueFilter;
  readonly limit?: number;
  readonly cursor?: PageCursor | null;
  readonly query?: string;
};

export function queuePath(base: string = RIGHTS_QUEUE_PATH, options: QueuePathOptions): string {
  const params = new URLSearchParams();
  params.set('kind', options.kind);
  params.set('filter', options.filter);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', JSON.stringify(options.cursor));
  if (options.query !== undefined) params.set('query', options.query);
  const suffix = params.toString();
  return suffix ? `${base}?${suffix}` : base;
}
