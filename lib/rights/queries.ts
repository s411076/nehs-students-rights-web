/**
 * Explicit select constants and DTO pickers for public/admin projections.
 * Every picker takes unknown rows and picks listed fields only — no spreads,
 * no invented columns, anonymous author_name omitted before serialization.
 */
import { KNOWN_STATUSES, PROPOSAL_CATEGORIES, PUBLIC_STATUSES } from './contracts';

export { PUBLIC_STATUSES };

export const PROPOSAL_SELECT = [
  'id',
  'title',
  'content',
  'author_name',
  'status',
  'upvotes_count',
  'reply',
  'created_at',
] as const;
export const PROPOSAL_SELECT_STRING = PROPOSAL_SELECT.join(',');

export const FEEDBACK_SELECT = [
  'id',
  'title',
  'content',
  'category',
  'is_anonymous',
  'author_name',
  'reply',
  'replied_at',
  'created_at',
] as const;
export const FEEDBACK_SELECT_STRING = FEEDBACK_SELECT.join(',');

export const COMMENT_SELECT = ['id', 'proposal_id', 'content', 'author_name', 'created_at'] as const;
export const COMMENT_SELECT_STRING = COMMENT_SELECT.join(',');

export const HOME_SELECT = ['id', 'title', 'content', 'created_at'] as const;
export const HOME_SELECT_STRING = HOME_SELECT.join(',');

export interface ProposalDTO {
  id: string;
  title: string;
  content: string;
  author_name: string;
  status: string;
  upvotes_count: number;
  reply: string;
  created_at: string;
}

export interface FeedbackAdminDTO {
  id: string;
  title: string;
  content: string;
  category: string;
  is_anonymous: boolean;
  author_name: string;
  reply: string;
  replied_at: string | null;
  created_at: string;
}

/** Anonymous public feedback omits `author_name`; UI falls back to 匿名學生. */
export type FeedbackPublicDTO = Omit<FeedbackAdminDTO, 'author_name'> & { author_name?: string };

export interface CommentDTO {
  id: string;
  proposal_id: string;
  content: string;
  author_name: string;
  created_at: string;
}

export interface HomeSectionDTO {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

/** Single shared public-status clause for home and list queries. */
export function buildPublicStatusFilter(): { column: string; values: string[] } {
  return { column: 'status', values: [...PUBLIC_STATUSES] };
}

interface StatusFilterQuery {
  in: (column: string, values: string[]) => unknown;
}

/** Applies the shared `.in('status', PUBLIC_STATUSES)` to any query builder. */
export function applyPublicStatusFilter<Q extends StatusFilterQuery>(query: Q): unknown {
  return query.in('status', [...PUBLIC_STATUSES]);
}

export function isPublicStatus(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return (PUBLIC_STATUSES as readonly string[]).includes(value);
}

function asRecord(row: unknown): Record<string, unknown> | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  return row as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asSafeCount(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function asReply(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value;
}

/** Public proposal DTO; unknown statuses are excluded (null), never guessed. */
export function toProposalDTO(row: unknown): ProposalDTO | null {
  const record = asRecord(row);
  if (record === null) return null;
  const id = asString(record['id']);
  const title = asString(record['title']);
  const content = asString(record['content']);
  const authorName = asString(record['author_name']);
  const status = asString(record['status']);
  const upvotesCount = asSafeCount(record['upvotes_count']);
  const reply = asReply(record['reply']);
  const createdAt = asString(record['created_at']);
  if (
    id === null || title === null || content === null || authorName === null ||
    status === null || upvotesCount === null || reply === null || createdAt === null
  ) {
    return null;
  }
  if (!(KNOWN_STATUSES as readonly string[]).includes(status)) return null;
  return {
    id,
    title,
    content,
    author_name: authorName,
    status,
    upvotes_count: upvotesCount,
    reply,
    created_at: createdAt,
  };
}

interface FeedbackFields {
  id: string;
  title: string;
  content: string;
  category: string;
  isAnonymous: boolean;
  reply: string;
  repliedAt: string | null;
  createdAt: string;
}

function readFeedbackFields(record: Record<string, unknown>): FeedbackFields | null {
  const id = asString(record['id']);
  const title = asString(record['title']);
  const content = asString(record['content']);
  const category = asString(record['category']);
  const isAnonymous = record['is_anonymous'];
  const reply = asReply(record['reply']);
  const createdAt = asString(record['created_at']);
  const repliedRaw = record['replied_at'];
  if (
    id === null || title === null || content === null || category === null ||
    typeof isAnonymous !== 'boolean' || reply === null || createdAt === null
  ) {
    return null;
  }
  if (!(PROPOSAL_CATEGORIES as readonly string[]).includes(category)) return null;
  if (repliedRaw !== null && typeof repliedRaw !== 'string') return null;
  return {
    id,
    title,
    content,
    category,
    isAnonymous,
    reply,
    repliedAt: repliedRaw,
    createdAt,
  };
}

/** Public feedback DTO; anonymous rows omit `author_name` before serialization. */
export function toFeedbackPublicDTO(row: unknown): FeedbackPublicDTO | null {
  const record = asRecord(row);
  if (record === null) return null;
  const fields = readFeedbackFields(record);
  if (fields === null) return null;
  if (fields.isAnonymous) {
    return {
      id: fields.id,
      title: fields.title,
      content: fields.content,
      category: fields.category,
      is_anonymous: true,
      reply: fields.reply,
      replied_at: fields.repliedAt,
      created_at: fields.createdAt,
    };
  }
  const authorName = asString(record['author_name']);
  if (authorName === null) return null;
  return {
    id: fields.id,
    title: fields.title,
    content: fields.content,
    category: fields.category,
    is_anonymous: false,
    author_name: authorName,
    reply: fields.reply,
    replied_at: fields.repliedAt,
    created_at: fields.createdAt,
  };
}

/** Admin feedback DTO keeps `author_name` but must stay behind server role checks. */
export function toFeedbackAdminDTO(row: unknown): FeedbackAdminDTO | null {
  const record = asRecord(row);
  if (record === null) return null;
  const fields = readFeedbackFields(record);
  if (fields === null) return null;
  const authorName = asString(record['author_name']);
  if (authorName === null) return null;
  return {
    id: fields.id,
    title: fields.title,
    content: fields.content,
    category: fields.category,
    is_anonymous: fields.isAnonymous,
    author_name: authorName,
    reply: fields.reply,
    replied_at: fields.repliedAt,
    created_at: fields.createdAt,
  };
}

export function toCommentDTO(row: unknown): CommentDTO | null {
  const record = asRecord(row);
  if (record === null) return null;
  const id = asString(record['id']);
  const proposalId = asString(record['proposal_id']);
  const content = asString(record['content']);
  const authorName = asString(record['author_name']);
  const createdAt = asString(record['created_at']);
  if (
    id === null || proposalId === null || content === null ||
    authorName === null || createdAt === null
  ) {
    return null;
  }
  return { id, proposal_id: proposalId, content, author_name: authorName, created_at: createdAt };
}

export function toHomeSectionDTO(row: unknown): HomeSectionDTO | null {
  const record = asRecord(row);
  if (record === null) return null;
  const id = asString(record['id']);
  const title = asString(record['title']);
  const content = asString(record['content']);
  const createdAt = asString(record['created_at']);
  if (id === null || title === null || content === null || createdAt === null) return null;
  return { id, title, content, created_at: createdAt };
}
