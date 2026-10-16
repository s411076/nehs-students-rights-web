import { makeFailure, makeSuccess, RIGHTS_ACTIONS, type RightsActionName, type RightsActionRequest, type RightsResult } from './contracts';
import { validateBody, validateCategory, validateCommentContent, validateControlStatus, validateCount,
  validateFeedbackTitle, validateId, validateIsAnonymous, validateRawTitle, validateReply } from './validation-values';
import { isRecord } from './queries';

const PAYLOAD_KEYS: Record<RightsActionName, readonly string[]> = {
  createProposal: ['title', 'content', 'category'], createFeedback: ['title', 'content', 'category', 'isAnonymous'],
  addComment: ['proposalId', 'content', 'isAnonymous'], setVote: ['proposalId', 'voted'],
  updateProposalControl: ['id', 'status', 'reply', 'expectedVersion'],
  approveProposal: ['id', 'expectedVersion'], rejectProposal: ['id', 'expectedVersion'],
  deleteProposal: ['id', 'expectedVersion'], deleteComment: ['id', 'proposalId', 'expectedVersion'],
  saveFeedbackReply: ['id', 'reply', 'expectedVersion'], deleteFeedback: ['id', 'expectedVersion'],
  createHomeSection: ['title', 'content'], deleteHomeSection: ['id', 'expectedVersion'],
};
function exactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key));
}
export function parseActionRequest(input: unknown): RightsResult<RightsActionRequest> {
  if (!isRecord(input) || !exactKeys(input, ['action', 'payload'])) return makeFailure('INVALID_PAYLOAD');
  const action = RIGHTS_ACTIONS.find(action => action === input.action);
  const payload = input.payload;
  if (action === undefined || !isRecord(payload) || !exactKeys(payload, PAYLOAD_KEYS[action])) return makeFailure('INVALID_PAYLOAD');
  switch (action) {
    case 'createProposal': {
      const title = validateRawTitle(payload.title), content = validateBody(payload.content), category = validateCategory(payload.category);
      if (!title.ok) return title; if (!content.ok) return content; if (!category.ok) return category;
      return makeSuccess({ action, payload: { title: title.data, content: content.data, category: category.data } });
    }
    case 'createFeedback': {
      const title = validateFeedbackTitle(payload.title), content = validateBody(payload.content), category = validateCategory(payload.category);
      const isAnonymous = validateIsAnonymous(payload.isAnonymous);
      if (!title.ok) return title; if (!content.ok) return content; if (!category.ok) return category; if (!isAnonymous.ok) return isAnonymous;
      return makeSuccess({ action, payload: { title: title.data, content: content.data, category: category.data, isAnonymous: isAnonymous.data } });
    }
    case 'addComment': {
      const proposalId = validateId(payload.proposalId), content = validateCommentContent(payload.content), isAnonymous = validateIsAnonymous(payload.isAnonymous);
      if (!proposalId.ok) return proposalId; if (!content.ok) return content; if (!isAnonymous.ok) return isAnonymous;
      return makeSuccess({ action, payload: { proposalId: proposalId.data, content: content.data, isAnonymous: isAnonymous.data } });
    }
    case 'setVote': {
      const proposalId = validateId(payload.proposalId), voted = validateIsAnonymous(payload.voted);
      if (!proposalId.ok) return proposalId; if (!voted.ok) return voted;
      return makeSuccess({ action, payload: { proposalId: proposalId.data, voted: voted.data } });
    }
    case 'createHomeSection': {
      const title = validateRawTitle(payload.title), content = validateBody(payload.content);
      if (!title.ok) return title; if (!content.ok) return content;
      return makeSuccess({ action, payload: { title: title.data, content: content.data } });
    }
    case 'updateProposalControl': {
      const id = validateId(payload.id), version = validateCount(payload.expectedVersion), status = validateControlStatus(payload.status), reply = validateReply(payload.reply);
      if (!id.ok) return id; if (!version.ok) return version; if (!status.ok) return status; if (!reply.ok) return reply;
      return makeSuccess({ action, payload: { id: id.data, expectedVersion: version.data, status: status.data, reply: reply.data } });
    }
    case 'saveFeedbackReply': {
      const id = validateId(payload.id), version = validateCount(payload.expectedVersion), reply = validateReply(payload.reply);
      if (!id.ok) return id; if (!version.ok) return version; if (!reply.ok) return reply;
      return makeSuccess({ action, payload: { id: id.data, expectedVersion: version.data, reply: reply.data } });
    }
    case 'deleteComment': {
      const id = validateId(payload.id), version = validateCount(payload.expectedVersion), proposalId = validateId(payload.proposalId);
      if (!id.ok) return id; if (!version.ok) return version; if (!proposalId.ok) return proposalId;
      return makeSuccess({ action, payload: { id: id.data, expectedVersion: version.data, proposalId: proposalId.data } });
    }
    case 'approveProposal': case 'rejectProposal': case 'deleteProposal': case 'deleteFeedback': case 'deleteHomeSection': {
      const id = validateId(payload.id), version = validateCount(payload.expectedVersion);
      if (!id.ok) return id; if (!version.ok) return version;
      return makeSuccess({ action, payload: { id: id.data, expectedVersion: version.data } });
    }
    default: return assertNever(action);
  }
}
function assertNever(action: never): never { throw new TypeError(`Unknown action: ${action}`); }
