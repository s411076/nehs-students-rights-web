import { CONTROL_STATUSES, LIMITS, PROPOSAL_CATEGORIES, makeFailure, makeSuccess,
  type ControlStatus, type ProposalCategory, type RightsResult } from './contracts';

export function countCodePoints(value: string): number { return Array.from(value).length; }
export function validateId(value: unknown): RightsResult<string> {
  return typeof value === 'string' && value.trim() !== '' && countCodePoints(value) <= LIMITS.ID_MAX
    ? makeSuccess(value) : makeFailure('INVALID_PAYLOAD');
}
export function validateCount(value: unknown): RightsResult<number> {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? makeSuccess(value) : makeFailure('INVALID_PAYLOAD');
}
function text(value: unknown, max: number, allowEmpty = false): RightsResult<string> {
  if (typeof value !== 'string') return makeFailure('INVALID_PAYLOAD');
  const trimmed = value.trim();
  return (allowEmpty || trimmed !== '') && countCodePoints(trimmed) <= max
    ? makeSuccess(trimmed) : makeFailure('INVALID_PAYLOAD');
}
export function validateRawTitle(value: unknown) { return text(value, LIMITS.RAW_TITLE_MAX); }
export function validateProposalFinalTitle(value: unknown) { return text(value, LIMITS.PROPOSAL_TITLE_MAX); }
export function validateBody(value: unknown) { return text(value, LIMITS.BODY_MAX); }
export function validateReply(value: unknown) { return text(value, LIMITS.REPLY_MAX, true); }
export function validateCommentContent(value: unknown) { return text(value, LIMITS.COMMENT_MAX); }
export function validateFeedbackTitle(value: unknown) { return text(value, LIMITS.RAW_TITLE_MAX, true); }
export function validateCategory(value: unknown): RightsResult<ProposalCategory> {
  const category = PROPOSAL_CATEGORIES.find(category => category === value);
  return category === undefined ? makeFailure('INVALID_PAYLOAD') : makeSuccess(category);
}
export function validateControlStatus(value: unknown): RightsResult<ControlStatus> {
  const status = CONTROL_STATUSES.find(status => status === value);
  return status === undefined ? makeFailure('INVALID_PAYLOAD') : makeSuccess(status);
}
export function validateIsAnonymous(value: unknown): RightsResult<boolean> {
  return typeof value === 'boolean' ? makeSuccess(value) : makeFailure('INVALID_PAYLOAD');
}
export function truncateToCodePoints(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('');
}
export function fallbackFeedbackTitle(title: string, content: string, max = 15): string {
  if (title !== '') return title;
  return Array.from(content).length > max ? `${truncateToCodePoints(content, max)}...` : content;
}
export function formatProposalTitle(rawTitle: unknown, category: unknown): RightsResult<string> {
  const categoryResult = validateCategory(category);
  if (!categoryResult.ok) return categoryResult;
  const rawResult = validateRawTitle(rawTitle);
  if (!rawResult.ok) return rawResult;
  const raw = rawResult.data;
  const finalTitle = raw.startsWith('[') ? raw : `[${categoryResult.data}] ${raw}`;
  return validateProposalFinalTitle(finalTitle);
}
