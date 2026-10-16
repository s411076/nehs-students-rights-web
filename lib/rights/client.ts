import { GENERIC_MESSAGES, REQUESTED_WITH_HEADER, RESULT_CODES, RIGHTS_ACTIONS_PATH, makeFailure } from './contracts';
import type { RightsActionRequest, RightsFailure, RightsResult } from './contracts';
import { parseMutationReceipt, type MutationReceipt } from './receipts';

export type ClientMutationResult =
  | { readonly ok: true; readonly data: MutationReceipt; readonly refresh: 'updated' | 'failed'; readonly message?: string }
  | RightsFailure
  | { readonly ok: false; readonly code: 'OUTCOME_UNKNOWN'; readonly message: string };

function parseResult(value: unknown): RightsResult<unknown> | null {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return null;
  if (value.ok === true && 'data' in value) return { ok: true, data: value.data };
  if (value.ok === false && 'code' in value) {
    const code = RESULT_CODES.find(code => code === value.code);
    if (code) return { ok: false, code, message: GENERIC_MESSAGES[code] };
  }
  return null;
}

export async function readRights<T>(path: string, parse: (data: unknown) => T | null): Promise<RightsResult<T>> {
  try {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const result = parseResult(await response.json());
    if (!result || response.ok !== result.ok) return makeFailure('UNAVAILABLE');
    if (!result.ok) return result;
    const parsed = parse(result.data);
    return parsed === null ? makeFailure('UNAVAILABLE') : { ok: true, data: parsed };
  } catch { return makeFailure('UNAVAILABLE'); }
}

export async function sendRightsAction(request: RightsActionRequest, refresh?: () => Promise<unknown>): Promise<ClientMutationResult> {
  let result: RightsResult<unknown> | null;
  try {
    const response = await fetch(RIGHTS_ACTIONS_PATH, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': REQUESTED_WITH_HEADER },
      body: JSON.stringify(request),
    });
    result = parseResult(await response.json());
    if (!result || response.ok !== result.ok) return unknownOutcome();
  } catch { return unknownOutcome(); }
  // Definitive rejections (400/401/403/409/413/415) pass through with generic
  // messages; only transport/ambiguous outcomes (network/timeout/shape
  // mismatch/503 UNAVAILABLE) collapse to OUTCOME_UNKNOWN. Fail-closed: never retry.
  if (!result.ok) return result.code === 'UNAVAILABLE' ? unknownOutcome() : result;
  const receipt = parseMutationReceipt(result.data, request);
  if (receipt === null) return unknownOutcome();
  if (refresh) {
    try {
      const refreshed: unknown = await refresh();
      if (typeof refreshed === 'object' && refreshed !== null && 'ok' in refreshed && refreshed.ok === false) {
        return { ok: true, data: receipt, refresh: 'failed', message: '已儲存，但清單更新失敗' };
      }
    } catch { return { ok: true, data: receipt, refresh: 'failed', message: '已儲存，但清單更新失敗' }; }
  }
  return { ok: true, data: receipt, refresh: 'updated' };
}

function unknownOutcome(): ClientMutationResult {
  return { ok: false, code: 'OUTCOME_UNKNOWN', message: '無法確認是否已儲存，請先更新清單確認，勿重複提交。' };
}

// Each UI operation owns its flight; independent users/actions never share a mutation cache.
export function createRightsActionFlight() {
  let pending: Promise<ClientMutationResult> | undefined;
  return (request: RightsActionRequest, refresh?: () => Promise<unknown>) => {
    if (pending) return pending;
    pending = sendRightsAction(request, refresh).finally(() => { pending = undefined; });
    return pending;
  };
}
