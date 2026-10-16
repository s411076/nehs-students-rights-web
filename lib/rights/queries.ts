import { KNOWN_STATUSES, PROPOSAL_CATEGORIES, PUBLIC_STATUSES } from './contracts';
export { PUBLIC_STATUSES };

export const PROPOSAL_SELECT = ['id', 'title', 'content', 'author_name', 'status', 'upvotes_count', 'reply', 'created_at', 'version', 'viewer_voted', 'legacy_upvotes_count'] as const;
export const FEEDBACK_SELECT = ['id', 'title', 'content', 'category', 'is_anonymous', 'author_name', 'reply', 'replied_at', 'created_at', 'version'] as const;
export const COMMENT_SELECT = ['id', 'proposal_id', 'content', 'author_name', 'created_at', 'version'] as const;
export const HOME_SELECT = ['id', 'title', 'content', 'created_at', 'version'] as const;
export const PROPOSAL_SELECT_STRING = PROPOSAL_SELECT.join(',');
export const FEEDBACK_SELECT_STRING = FEEDBACK_SELECT.join(',');
export const COMMENT_SELECT_STRING = COMMENT_SELECT.join(',');
export const HOME_SELECT_STRING = HOME_SELECT.join(',');

export type HomeSectionDTO = {
  readonly id: string; readonly title: string; readonly content: string;
  readonly created_at: string; readonly version: number;
};
export type ProposalDTO = HomeSectionDTO & {
  readonly author_name: string; readonly status: string; readonly upvotes_count: number;
  readonly reply: string; readonly viewer_voted: boolean; readonly legacy_upvotes_count: number;
};
export type FeedbackPublicDTO = HomeSectionDTO & {
  readonly category: string; readonly is_anonymous: boolean; readonly author_name?: string;
  readonly reply: string; readonly replied_at: string | null;
};
// Admin lists remain redacted; identifying authors requires the separate guarded lookup.
export type FeedbackAdminDTO = FeedbackPublicDTO;
export type CommentDTO = {
  readonly id: string; readonly proposal_id: string; readonly content: string;
  readonly author_name: string; readonly created_at: string; readonly version: number;
};
export type AuthorDTO = {
  readonly attribution: 'known' | 'legacy_unverified' | 'unknown';
  readonly user_id: string | null; readonly email: string | null; readonly display_name: string | null;
};

export function buildPublicStatusFilter(): { column: string; values: string[] } {
  return { column: 'status', values: [...PUBLIC_STATUSES] };
}
export function applyPublicStatusFilter<Q extends { in: (column: string, values: string[]) => unknown }>(query: Q): unknown {
  return query.in('status', [...PUBLIC_STATUSES]);
}
export function isPublicStatus(value: unknown): boolean {
  return PUBLIC_STATUSES.some(status => status === value);
}
export function isRecord(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row);
}
export function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function toHomeSectionDTO(row: unknown): HomeSectionDTO | null {
  if (!isRecord(row) || typeof row.id !== 'string' || typeof row.title !== 'string' ||
      typeof row.content !== 'string' || typeof row.created_at !== 'string' || !isSafeCount(row.version)) return null;
  return { id: row.id, title: row.title, content: row.content, created_at: row.created_at, version: row.version };
}
export function toProposalDTO(row: unknown): ProposalDTO | null {
  const base = toHomeSectionDTO(row);
  if (!base || !isRecord(row) || typeof row.author_name !== 'string' || typeof row.status !== 'string' ||
      !KNOWN_STATUSES.some(status => status === row.status) || !isSafeCount(row.upvotes_count) ||
      typeof row.reply !== 'string' || typeof row.viewer_voted !== 'boolean' || !isSafeCount(row.legacy_upvotes_count)) return null;
  return { ...base, author_name: row.author_name, status: row.status, upvotes_count: row.upvotes_count,
    reply: row.reply, viewer_voted: row.viewer_voted, legacy_upvotes_count: row.legacy_upvotes_count };
}
export function toFeedbackPublicDTO(row: unknown): FeedbackPublicDTO | null {
  const base = toHomeSectionDTO(row);
  if (!base || !isRecord(row) || typeof row.category !== 'string' ||
      !PROPOSAL_CATEGORIES.some(category => category === row.category) || typeof row.is_anonymous !== 'boolean' ||
      typeof row.reply !== 'string' || (row.replied_at !== null && typeof row.replied_at !== 'string')) return null;
  const fields = { ...base, category: row.category, is_anonymous: row.is_anonymous, reply: row.reply, replied_at: row.replied_at };
  if (row.is_anonymous) return fields;
  return typeof row.author_name === 'string' ? { ...fields, author_name: row.author_name } : null;
}
export const toFeedbackAdminDTO = toFeedbackPublicDTO;
export function toCommentDTO(row: unknown): CommentDTO | null {
  if (!isRecord(row) || typeof row.id !== 'string' || typeof row.proposal_id !== 'string' ||
      typeof row.content !== 'string' || typeof row.author_name !== 'string' ||
      typeof row.created_at !== 'string' || !isSafeCount(row.version)) return null;
  return { id: row.id, proposal_id: row.proposal_id, content: row.content,
    author_name: row.is_anonymous === true ? '匿名學生' : row.author_name, created_at: row.created_at, version: row.version };
}
export function toAuthorDTO(row: unknown): AuthorDTO | null {
  if (!isRecord(row)) return null;
  const { attribution, user_id, email, display_name } = row;
  if (attribution !== 'known' && attribution !== 'legacy_unverified' && attribution !== 'unknown') return null;
  if ((user_id !== null && typeof user_id !== 'string') || (email !== null && typeof email !== 'string') ||
      (display_name !== null && typeof display_name !== 'string')) return null;
  return { attribution, user_id, email, display_name };
}
