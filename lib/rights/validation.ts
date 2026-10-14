/**
 * Shared UI/server validation: lengths in Unicode code points, IDs, counts
 * and exact per-action payload narrowing. Rejects instead of truncating.
 * No dependencies — safe to import from client components and routes.
 */
import {
  CONTROL_STATUSES,
  LIMITS,
  PROPOSAL_CATEGORIES,
  RIGHTS_ACTIONS,
  makeFailure,
  makeSuccess,
  type ProposalCategory,
  type RightsActionName,
  type RightsActionRequest,
  type RightsResult,
} from './contracts';

export function countCodePoints(value: string): number {
  return Array.from(value).length;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(): RightsResult<never> {
  return makeFailure('INVALID_PAYLOAD');
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  if (Object.keys(record).length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function trimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function withinCodePoints(value: string, max: number): boolean {
  return countCodePoints(value) <= max;
}

/** IDs are nonempty strings up to 128 chars; never assumed to be UUIDs. */
export function validateId(value: unknown): RightsResult<string> {
  if (typeof value !== 'string') return invalid();
  if (value.trim() === '') return invalid();
  if (countCodePoints(value) > LIMITS.ID_MAX) return invalid();
  return makeSuccess(value);
}

/** Count is a nonnegative safe integer: no NaN/float/negative/unsafe. */
export function validateCount(value: unknown): RightsResult<number> {
  if (typeof value !== 'number') return invalid();
  if (!Number.isSafeInteger(value)) return invalid();
  if (value < 0) return invalid();
  return makeSuccess(value);
}

/** Raw user-supplied title: trimmed nonempty, at most 100 code points. */
export function validateRawTitle(value: unknown): RightsResult<string> {
  const trimmed = trimmedString(value);
  if (trimmed === null) return invalid();
  if (!withinCodePoints(trimmed, LIMITS.RAW_TITLE_MAX)) return invalid();
  return makeSuccess(trimmed);
}

/** Generated proposal title after the category-prefix rule: at most 120 code points. */
export function validateProposalFinalTitle(value: unknown): RightsResult<string> {
  const trimmed = trimmedString(value);
  if (trimmed === null) return invalid();
  if (!withinCodePoints(trimmed, LIMITS.PROPOSAL_TITLE_MAX)) return invalid();
  return makeSuccess(trimmed);
}

/** Proposal/feedback body: trimmed nonempty, at most 5000 code points. */
export function validateBody(value: unknown): RightsResult<string> {
  const trimmed = trimmedString(value);
  if (trimmed === null) return invalid();
  if (!withinCodePoints(trimmed, LIMITS.BODY_MAX)) return invalid();
  return makeSuccess(trimmed);
}

/** Admin reply: may be empty (clearing needs UI confirmation), at most 5000 code points. */
export function validateReply(value: unknown): RightsResult<string> {
  if (typeof value !== 'string') return invalid();
  const trimmed = value.trim();
  if (!withinCodePoints(trimmed, LIMITS.REPLY_MAX)) return invalid();
  return makeSuccess(trimmed);
}

/** Comment content: trimmed nonempty, at most 1000 code points. */
export function validateCommentContent(value: unknown): RightsResult<string> {
  const trimmed = trimmedString(value);
  if (trimmed === null) return invalid();
  if (!withinCodePoints(trimmed, LIMITS.COMMENT_MAX)) return invalid();
  return makeSuccess(trimmed);
}

export function validateCategory(value: unknown): RightsResult<ProposalCategory> {
  if (typeof value !== 'string') return invalid();
  if (!(PROPOSAL_CATEGORIES as readonly string[]).includes(value)) return invalid();
  return makeSuccess(value as ProposalCategory);
}

/** Editable control statuses equal the public set; pending/rejected/unknown fail. */
export function validateControlStatus(value: unknown): RightsResult<string> {
  if (typeof value !== 'string') return invalid();
  if (!(CONTROL_STATUSES as readonly string[]).includes(value)) return invalid();
  return makeSuccess(value);
}

export function validateIsAnonymous(value: unknown): RightsResult<boolean> {
  if (typeof value !== 'boolean') return invalid();
  return makeSuccess(value);
}

/**
 * Feedback title is optional: an empty title falls back to the existing
 * content-derived title. A provided title obeys the raw 100-code-point limit.
 */
export function validateFeedbackTitle(value: unknown): RightsResult<string> {
  if (typeof value !== 'string') return invalid();
  const trimmed = value.trim();
  if (!withinCodePoints(trimmed, LIMITS.RAW_TITLE_MAX)) return invalid();
  return makeSuccess(trimmed);
}

/**
 * Preserves the existing raw proposal prefix rule (`[category] raw` unless
 * the raw title already starts with `[`) and validates the final title too.
 */
export function formatProposalTitle(rawTitle: unknown, category: unknown): RightsResult<string> {
  const categoryResult = validateCategory(category);
  if (!categoryResult.ok) return categoryResult;
  const rawResult = validateRawTitle(rawTitle);
  if (!rawResult.ok) return rawResult;
  const raw = rawResult.data;
  const finalTitle = raw.startsWith('[') ? raw : `[${categoryResult.data}] ${raw}`;
  return validateProposalFinalTitle(finalTitle);
}

const PAYLOAD_KEYS: Record<RightsActionName, readonly string[]> = {
  createProposal: ['title', 'content', 'category'],
  createFeedback: ['title', 'content', 'category', 'isAnonymous'],
  addComment: ['proposalId', 'content', 'isAnonymous'],
  setVoteCount: ['proposalId', 'count'],
  updateProposalControl: ['id', 'status', 'reply'],
  approveProposal: ['id'],
  rejectProposal: ['id'],
  deleteProposal: ['id'],
  deleteComment: ['id', 'proposalId'],
  saveFeedbackReply: ['id', 'reply'],
  deleteFeedback: ['id'],
  createHomeSection: ['title', 'content'],
  deleteHomeSection: ['id'],
};

function narrowPayload(
  action: RightsActionName,
  payload: Record<string, unknown>,
): RightsResult<RightsActionRequest['payload']> {
  switch (action) {
    case 'createProposal': {
      const title = validateRawTitle(payload['title']);
      if (!title.ok) return title;
      const content = validateBody(payload['content']);
      if (!content.ok) return content;
      const category = validateCategory(payload['category']);
      if (!category.ok) return category;
      return makeSuccess({ title: title.data, content: content.data, category: category.data });
    }
    case 'createFeedback': {
      const title = validateFeedbackTitle(payload['title']);
      if (!title.ok) return title;
      const content = validateBody(payload['content']);
      if (!content.ok) return content;
      const category = validateCategory(payload['category']);
      if (!category.ok) return category;
      const isAnonymous = validateIsAnonymous(payload['isAnonymous']);
      if (!isAnonymous.ok) return isAnonymous;
      return makeSuccess({
        title: title.data,
        content: content.data,
        category: category.data,
        isAnonymous: isAnonymous.data,
      });
    }
    case 'addComment': {
      const proposalId = validateId(payload['proposalId']);
      if (!proposalId.ok) return proposalId;
      const content = validateCommentContent(payload['content']);
      if (!content.ok) return content;
      const isAnonymous = validateIsAnonymous(payload['isAnonymous']);
      if (!isAnonymous.ok) return isAnonymous;
      return makeSuccess({
        proposalId: proposalId.data,
        content: content.data,
        isAnonymous: isAnonymous.data,
      });
    }
    case 'setVoteCount': {
      const proposalId = validateId(payload['proposalId']);
      if (!proposalId.ok) return proposalId;
      const count = validateCount(payload['count']);
      if (!count.ok) return count;
      return makeSuccess({ proposalId: proposalId.data, count: count.data });
    }
    case 'updateProposalControl': {
      const id = validateId(payload['id']);
      if (!id.ok) return id;
      const status = validateControlStatus(payload['status']);
      if (!status.ok) return status;
      const reply = validateReply(payload['reply']);
      if (!reply.ok) return reply;
      return makeSuccess({
        id: id.data,
        status: status.data,
        reply: reply.data,
      });
    }
    case 'approveProposal':
    case 'rejectProposal':
    case 'deleteProposal':
    case 'deleteFeedback':
    case 'deleteHomeSection': {
      const id = validateId(payload['id']);
      if (!id.ok) return id;
      return makeSuccess({ id: id.data });
    }
    case 'deleteComment': {
      const id = validateId(payload['id']);
      if (!id.ok) return id;
      const proposalId = validateId(payload['proposalId']);
      if (!proposalId.ok) return proposalId;
      return makeSuccess({ id: id.data, proposalId: proposalId.data });
    }
    case 'saveFeedbackReply': {
      const id = validateId(payload['id']);
      if (!id.ok) return id;
      const reply = validateReply(payload['reply']);
      if (!reply.ok) return reply;
      return makeSuccess({ id: id.data, reply: reply.data });
    }
    case 'createHomeSection': {
      const title = validateRawTitle(payload['title']);
      if (!title.ok) return title;
      const content = validateBody(payload['content']);
      if (!content.ok) return content;
      return makeSuccess({ title: title.data, content: content.data });
    }
  }
}

/**
 * Narrows an unknown envelope to the exact `{action, payload}` contract.
 * Rejects extra fields, invalid actions and malformed payloads before any
 * database mutation. Returns a freshly built payload — never the input.
 */
export function parseActionRequest(input: unknown): RightsResult<RightsActionRequest> {
  if (!isPlainRecord(input)) return invalid();
  if (!hasExactKeys(input, ['action', 'payload'])) return invalid();
  const { action, payload } = input;
  if (typeof action !== 'string') return invalid();
  if (!(RIGHTS_ACTIONS as readonly string[]).includes(action)) return invalid();
  const name = action as RightsActionName;
  if (!isPlainRecord(payload)) return invalid();
  if (!hasExactKeys(payload, PAYLOAD_KEYS[name])) return invalid();
  const narrowed = narrowPayload(name, payload);
  if (!narrowed.ok) return narrowed;
  return makeSuccess({ action: name, payload: narrowed.data } as RightsActionRequest);
}
