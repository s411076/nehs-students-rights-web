/**
 * Exact POST /api/rights/actions contract: 13-action union, status/category
 * sets, endpoint paths and typed results. No validation logic here —
 * see validation.ts. No imports so downstream tasks keep a stable API.
 */

export const PROPOSAL_CATEGORIES = ['環境與設備', '學聯與活動', '課程與教學', '其他'] as const;
export type ProposalCategory = (typeof PROPOSAL_CATEGORIES)[number];

export const PUBLIC_STATUSES = ['處理中', '已結案'] as const;
export type PublicStatus = (typeof PUBLIC_STATUSES)[number];

export const PENDING_STATUS = '待審核' as const;
export const REJECTED_STATUS = '被退回' as const;

export const CONTROL_STATUSES = PUBLIC_STATUSES;
export type ControlStatus = PublicStatus;

export const KNOWN_STATUSES = [...PUBLIC_STATUSES, PENDING_STATUS, REJECTED_STATUS] as const;
export type KnownStatus = (typeof KNOWN_STATUSES)[number];

export const LIMITS = {
  RAW_TITLE_MAX: 100,
  PROPOSAL_TITLE_MAX: 120,
  BODY_MAX: 5000,
  REPLY_MAX: 5000,
  COMMENT_MAX: 1000,
  ID_MAX: 128,
  ACTION_BODY_MAX_BYTES: 65536,
} as const;

export const RIGHTS_ACTIONS_PATH = '/api/rights/actions';
export const RIGHTS_SESSION_PATH = '/api/rights/session';
export const RIGHTS_FEEDBACK_PATH = '/api/rights/feedback';
export const RIGHTS_PENDING_PATH = '/api/rights/proposals/pending';

export const ENDPOINTS = {
  ACTIONS: RIGHTS_ACTIONS_PATH,
  SESSION: RIGHTS_SESSION_PATH,
  FEEDBACK: RIGHTS_FEEDBACK_PATH,
  PENDING: RIGHTS_PENDING_PATH,
} as const;

export const REQUESTED_WITH_HEADER = 'nehs-web';

export type StudentActionName = 'createProposal' | 'createFeedback' | 'addComment' | 'setVote';
export type AdminActionName =
  | 'updateProposalControl'
  | 'approveProposal'
  | 'rejectProposal'
  | 'deleteProposal'
  | 'deleteComment'
  | 'saveFeedbackReply'
  | 'deleteFeedback'
  | 'createHomeSection'
  | 'deleteHomeSection';
export type RightsActionName = StudentActionName | AdminActionName;

export const STUDENT_ACTIONS: readonly StudentActionName[] = [
  'createProposal',
  'createFeedback',
  'addComment',
  'setVote',
];

export const ADMIN_ACTIONS: readonly AdminActionName[] = [
  'updateProposalControl',
  'approveProposal',
  'rejectProposal',
  'deleteProposal',
  'deleteComment',
  'saveFeedbackReply',
  'deleteFeedback',
  'createHomeSection',
  'deleteHomeSection',
];

export const RIGHTS_ACTIONS: readonly RightsActionName[] = [...STUDENT_ACTIONS, ...ADMIN_ACTIONS];

export interface CreateProposalPayload {
  title: string;
  content: string;
  category: ProposalCategory;
}
export interface CreateFeedbackPayload {
  title: string;
  content: string;
  category: ProposalCategory;
  isAnonymous: boolean;
}
export interface AddCommentPayload {
  proposalId: string;
  content: string;
  isAnonymous: boolean;
}
export interface SetVotePayload {
  proposalId: string;
  voted: boolean;
}
export interface UpdateProposalControlPayload {
  id: string;
  expectedVersion: number;
  status: ControlStatus;
  reply: string;
}
export interface IdOnlyPayload {
  id: string;
  expectedVersion: number;
}
export interface DeleteCommentPayload {
  id: string;
  expectedVersion: number;
  proposalId: string;
}
export interface SaveFeedbackReplyPayload {
  id: string;
  expectedVersion: number;
  reply: string;
}
export interface CreateHomeSectionPayload {
  title: string;
  content: string;
}

export type RightsActionRequest =
  | { action: 'createProposal'; payload: CreateProposalPayload }
  | { action: 'createFeedback'; payload: CreateFeedbackPayload }
  | { action: 'addComment'; payload: AddCommentPayload }
  | { action: 'setVote'; payload: SetVotePayload }
  | { action: 'updateProposalControl'; payload: UpdateProposalControlPayload }
  | { action: 'approveProposal'; payload: IdOnlyPayload }
  | { action: 'rejectProposal'; payload: IdOnlyPayload }
  | { action: 'deleteProposal'; payload: IdOnlyPayload }
  | { action: 'deleteComment'; payload: DeleteCommentPayload }
  | { action: 'saveFeedbackReply'; payload: SaveFeedbackReplyPayload }
  | { action: 'deleteFeedback'; payload: IdOnlyPayload }
  | { action: 'createHomeSection'; payload: CreateHomeSectionPayload }
  | { action: 'deleteHomeSection'; payload: IdOnlyPayload };

export type ResultCode =
  | 'INVALID_PAYLOAD'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'UNAVAILABLE';

export const RESULT_CODES: readonly ResultCode[] = [
  'INVALID_PAYLOAD',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'UNAVAILABLE',
];

export const GENERIC_MESSAGES: Record<ResultCode, string> = {
  INVALID_PAYLOAD: '資料格式不正確，請檢查後再試一次。',
  UNAUTHORIZED: '尚未登入或登入已失效，請重新登入。',
  FORBIDDEN: '沒有執行此操作的權限。',
  CONFLICT: '資料狀態已變更，無法完成此操作。',
  PAYLOAD_TOO_LARGE: '提交內容過大，請縮減後再試一次。',
  UNSUPPORTED_MEDIA: '不支援的請求格式。',
  UNAVAILABLE: '服務暫時無法使用，請稍後再試。',
};

export type RightsSuccess<T> = { ok: true; data: T };
export type RightsFailure = { ok: false; code: ResultCode; message: string };
export type RightsResult<T> = RightsSuccess<T> | RightsFailure;

export function makeFailure(code: ResultCode): RightsFailure {
  return { ok: false, code, message: GENERIC_MESSAGES[code] };
}

export function makeSuccess<T>(data: T): RightsSuccess<T> {
  return { ok: true, data };
}
