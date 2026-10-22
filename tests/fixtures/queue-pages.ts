import type { PageCursor } from '../../lib/rights/pagination';
import { parseQueueParameters } from '../../lib/rights/queues';
import type { QueueCounts, QueuePage, QueueParameters } from '../../lib/rights/queues';

type QueueRow = {
  readonly id: string;
  readonly created_at: string;
  readonly title?: string;
  readonly content?: string;
};
type FeedbackRow = QueueRow & { readonly reply: string };
type ProposalRow = QueueRow & { readonly status: string };
type QueueMetadata = {
  readonly counts: QueueCounts;
  readonly total: number;
  readonly nextCursor?: PageCursor | null;
};

export function queuePage<T>(items: readonly T[], metadata: QueueMetadata): QueuePage<T> {
  return { items: [...items], nextCursor: metadata.nextCursor ?? null, total: metadata.total, counts: metadata.counts };
}

function parameters(path: string): QueueParameters {
  const parsed = parseQueueParameters(new URL(path, 'http://localhost').searchParams);
  if (!parsed.ok) throw new TypeError(`Invalid queue fixture request: ${path}`);
  return parsed.data;
}

function matching<T extends QueueRow>(rows: readonly T[], query: string): readonly T[] {
  const needle = query.toLocaleLowerCase();
  return rows.filter(row => `${row.title ?? ''}\n${row.content ?? ''}`.toLocaleLowerCase().includes(needle));
}

function sliceQueue<T extends QueueRow>(rows: readonly T[], request: QueueParameters, counts: QueueCounts): QueuePage<T> {
  const total = Object.entries(counts).find(([key]) => key === request.p_filter)?.[1];
  if (total === undefined) throw new TypeError('Queue fixture filter has no count');
  const direction = request.p_kind === 'pending' || request.p_filter === 'awaiting' ? 1 : -1;
  const compare = (left: QueueRow, right: QueueRow) => direction * (
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
  const cursor = request.p_cursor;
  const remaining = [...rows].sort(compare).filter(row => cursor === null || compare(row, cursor) > 0);
  const items = remaining.slice(0, request.p_limit);
  const last = items.at(-1);
  return queuePage(items, { counts, total, nextCursor: remaining.length > items.length && last
    ? { created_at: last.created_at, id: last.id } : null });
}

export function feedbackQueuePage<T extends FeedbackRow>(population: readonly T[], path = '/api/rights/queue?kind=feedback&filter=all') {
  const request = parameters(path);
  const rows = matching(population, request.p_query);
  const awaiting = rows.filter(row => row.reply === '');
  const replied = rows.filter(row => row.reply !== '');
  const counts = { all: rows.length, awaiting: awaiting.length, replied: replied.length };
  switch (request.p_filter) {
    case 'all': return sliceQueue(rows, request, counts);
    case 'awaiting': return sliceQueue(awaiting, request, counts);
    case 'replied': return sliceQueue(replied, request, counts);
    default: throw new TypeError('Unexpected feedback fixture filter');
  }
}

export function proposalQueuePage<T extends ProposalRow>(population: readonly T[], path = '/api/rights/queue?kind=proposal&filter=all') {
  const request = parameters(path);
  const rows = matching(population.filter(row => row.status === '處理中' || row.status === '已結案'), request.p_query);
  const processing = rows.filter(row => row.status === '處理中');
  const closed = rows.filter(row => row.status === '已結案');
  const counts = { all: rows.length, processing: processing.length, closed: closed.length };
  switch (request.p_filter) {
    case 'all': return sliceQueue(rows, request, counts);
    case 'processing': return sliceQueue(processing, request, counts);
    case 'closed': return sliceQueue(closed, request, counts);
    default: throw new TypeError('Unexpected proposal fixture filter');
  }
}

export function pendingQueuePage<T extends ProposalRow>(population: readonly T[], path = '/api/rights/queue?kind=pending&filter=pending') {
  const request = parameters(path);
  const rows = matching(population.filter(row => row.status === '待審核'), request.p_query);
  return sliceQueue(rows, request, { pending: rows.length });
}
