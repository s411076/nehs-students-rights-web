import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AuthContextValue } from '../../components/AuthProvider';
import type { FeedbackAdminDTO } from '../../lib/rights/queries';
const mocks = vi.hoisted(() => ({ auth: null as AuthContextValue | null, refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('../../components/AuthProvider', () => ({ useAuth: () => mocks.auth }));
import AdminFeedbackPanel from '../../components/admin/AdminFeedbackPanel';

const row: FeedbackAdminDTO = { id: 'feedback-1', title: '建言', content: 'PRIVATE_ADMIN_CONTENT', category: '其他',
  is_anonymous: false, author_name: '學生', reply: '原有回覆', replied_at: null, created_at: '2026-01-01T00:00:00Z' };
function auth(id = 'admin', generation = 1): AuthContextValue {
  const identity = { id, email: `${id}@nehs.hc.edu.tw`, displayName: id, isAdmin: true };
  return { status: 'verified', identity, user: identity, generation, isAdmin: true, isLoggedIn: true };
}
beforeEach(() => { mocks.auth = auth(); mocks.refresh.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() { return render(<AdminFeedbackPanel ownerId="admin" feedback={[row]} />); }
function submit(reply = '新回覆') {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: reply } });
  fireEvent.click(screen.getByRole('button', { name: '發布/更新回覆' }));
}
test('performs no browser feedback query on mount', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  mount();
  expect(screen.getByText(row.content)).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
test('saves once through POST helper and refreshes after verified success', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: row.id } }));
  vi.stubGlobal('fetch', fetch); mount();
  submit();
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledWith('/api/rights/actions', expect.objectContaining({ method: 'POST',
    body: JSON.stringify({ action: 'saveFeedbackReply', payload: { id: row.id, reply: '新回覆' } }) }));
  expect(screen.getByRole('textbox')).toHaveValue('新回覆');
});
test.each(['CONFLICT', 'UNAVAILABLE'])('retains edited input without success when %s is returned', async code => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, code }, { status: code === 'CONFLICT' ? 409 : 503 })));
  mount(); submit();
  await waitFor(() => expect(screen.getByRole('status')).toBeVisible());
  expect(screen.getByRole('textbox')).toHaveValue('新回覆');
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText('操作已成功完成。')).not.toBeInTheDocument();
});
test.each(['UNAUTHORIZED', 'FORBIDDEN'])('hides private content when action returns %s', async code => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, code }, { status: code === 'UNAUTHORIZED' ? 401 : 403 })));
  mount(); submit();
  await waitFor(() => expect(screen.queryByText(row.content)).not.toBeInTheDocument());
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
test('keeps cleared draft without submitting when explicit confirmation is declined', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  mount(); submit('');
  expect(confirm).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toHaveValue('');
});
test('saves empty reply only after explicit confirmation', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: row.id } }));
  vi.stubGlobal('fetch', fetch); vi.spyOn(window, 'confirm').mockReturnValue(true);
  mount(); submit('');
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledWith('/api/rights/actions', expect.objectContaining({ body: JSON.stringify({ action: 'saveFeedbackReply', payload: { id: row.id, reply: '' } }) }));
});
test('deletes via action after confirmation and removes content only on success', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: row.id } }));
  vi.stubGlobal('fetch', fetch); vi.spyOn(window, 'confirm').mockReturnValue(true);
  mount(); fireEvent.click(screen.getByRole('button', { name: '刪除建言' }));
  await waitFor(() => expect(screen.queryByText(row.content)).not.toBeInTheDocument());
  expect(fetch).toHaveBeenCalledWith('/api/rights/actions', expect.objectContaining({ body: JSON.stringify({ action: 'deleteFeedback', payload: { id: row.id } }) }));
});
test('does not restore old-user content or refresh when delayed action finishes after account switch', async () => {
  let finish: (response: Response) => void = () => { throw new Error('Missing pending action'); };
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const view = mount(); submit();
  mocks.auth = auth('other-admin', 2);
  view.rerender(<AdminFeedbackPanel ownerId="admin" feedback={[row]} />);
  await act(async () => { finish(Response.json({ ok: true, data: { id: row.id } })); });
  expect(screen.queryByText(row.content)).not.toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
test('reports committed save separately when refresh fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: row.id } })));
  mocks.refresh.mockImplementation(() => { throw new Error('refresh failure'); });
  mount(); submit();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已儲存，但清單更新失敗'));
  expect(screen.getByRole('textbox')).toHaveValue('新回覆');
});
