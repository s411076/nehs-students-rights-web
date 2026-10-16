import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AuthContextValue } from '../../components/AuthProvider';
import type { FeedbackAdminDTO } from '../../lib/rights/queries';
const mocks = vi.hoisted(() => ({ auth: null as AuthContextValue | null }));
vi.mock('../../components/AuthProvider', () => ({ useAuth: () => mocks.auth }));
import AdminFeedbackPanel from '../../components/admin/AdminFeedbackPanel';

const row: FeedbackAdminDTO = { id: 'feedback-1', title: '建言', content: 'PRIVATE_ADMIN_CONTENT', category: '其他',
   is_anonymous: false, author_name: '學生', reply: '原有回覆', replied_at: null, created_at: '2026-01-01T00:00:00Z', version: 1 };
function auth(id = 'admin', generation = 1): AuthContextValue {
  const identity = { id, email: `${id}@nehs.hc.edu.tw`, displayName: id, isAdmin: true };
  return { status: 'verified', identity, user: identity, generation, isAdmin: true, isLoggedIn: true };
}
beforeEach(() => { mocks.auth = auth(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() { return render(<AdminFeedbackPanel ownerId="admin" feedback={[row]} nextCursor={null} />); }
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
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: { id: row.id, version: 2 } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...row, reply: '新回覆', version: 2 }], nextCursor: null } }));
  vi.stubGlobal('fetch', fetch); mount();
  submit();
  expect(await screen.findByRole('status')).toHaveTextContent('操作已成功完成。');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledWith('/api/rights/actions', expect.objectContaining({ method: 'POST' }));
  expect(new URL(String(fetch.mock.calls[1]?.[0]), 'http://localhost').pathname).toBe('/api/rights/admin/feedback');
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply', payload: { id: row.id, reply: '新回覆', expectedVersion: 1 } });
  expect(screen.getByRole('textbox')).toHaveValue('新回覆');
});
test.each(['CONFLICT', 'UNAVAILABLE'])('retains edited input without success when %s is returned', async code => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: false, code }, { status: code === 'CONFLICT' ? 409 : 503 }));
  vi.stubGlobal('fetch', fetch);
  mount(); submit();
  await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
  expect(screen.getByRole('textbox')).toHaveValue('新回覆');
  expect(fetch).toHaveBeenCalledOnce();
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
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: { id: row.id, version: 2 } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...row, reply: '', version: 2 }], nextCursor: null } }));
  vi.stubGlobal('fetch', fetch); vi.spyOn(window, 'confirm').mockReturnValue(true);
  mount(); submit('');
  expect(await screen.findByRole('status')).toHaveTextContent('操作已成功完成。');
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply', payload: { id: row.id, reply: '', expectedVersion: 1 } });
});
test('deletes via action after confirmation and removes content only on success', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: row.id, deleted: true } }));
  vi.stubGlobal('fetch', fetch); vi.spyOn(window, 'confirm').mockReturnValue(true);
  mount(); fireEvent.click(screen.getByRole('button', { name: '刪除建言' }));
  await waitFor(() => expect(screen.queryByText(row.content)).not.toBeInTheDocument());
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ action: 'deleteFeedback', payload: { id: row.id, expectedVersion: 1 } });
});
test('does not restore old-user content or refresh when delayed action finishes after account switch', async () => {
  let finish: (response: Response) => void = () => { throw new Error('Missing pending action'); };
  const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const view = mount(); submit();
  mocks.auth = auth('other-admin', 2);
  view.rerender(<AdminFeedbackPanel ownerId="admin" feedback={[row]} nextCursor={null} />);
  await act(async () => { finish(Response.json({ ok: true, data: { id: row.id, version: 2 } })); });
  expect(screen.queryByText(row.content)).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledOnce();
});
test('reports committed save separately when refresh fails', async () => {
  // Given
  let finish: (response: Response) => void = () => { throw new TypeError('Missing pending refresh'); };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: { id: row.id, version: 2 } }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  // When
  mount(); submit();
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: '發布中...' })).toBeDisabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  await act(async () => finish(Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 })));
  // Then
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已儲存，但清單更新失敗'));
  expect(screen.getByRole('textbox')).toHaveValue('新回覆');
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('retains a dirty reply and its original version across server prop refresh', async () => {
  // Given
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  const view = mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unreconciled draft' } });
  // When
  view.rerender(<AdminFeedbackPanel ownerId="admin" feedback={[{ ...row, reply: 'New server reply', version: 2 }]} nextCursor={null} />);
  fireEvent.click(screen.getByRole('button', { name: '發布/更新回覆' }));
  // Then
  expect(await screen.findByRole('alert')).toHaveTextContent(/草稿已保留.*重新載入/);
  expect(screen.getByRole('textbox')).toHaveValue('Unreconciled draft');
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    action: 'saveFeedbackReply', payload: { id: row.id, reply: 'Unreconciled draft', expectedVersion: 1 },
  });
});

test('appends admin feedback using its server-provided cursor without eagerly looking up authors', async () => {
  // Given
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: row.id };
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: {
    items: [{ ...row, id: 'next', title: 'Older feedback', content: 'Older body', is_anonymous: true, author_name: 'AUTHOR_SENTINEL' }], nextCursor: null,
  } }));
  vi.stubGlobal('fetch', fetch);
  render(<AdminFeedbackPanel ownerId="admin" feedback={[row]} nextCursor={cursor} />);
  // When
  fireEvent.click(screen.getByRole('button', { name: '載入更多管理建言' }));
  // Then
  expect(await screen.findByText('Older feedback')).toBeVisible();
  expect(screen.getByText(row.content)).toBeVisible();
  expect(fetch).toHaveBeenCalledOnce();
  const url = new URL(String(fetch.mock.calls[0]?.[0]), 'http://localhost');
  expect(url.pathname).toBe('/api/rights/admin/feedback');
  expect(JSON.parse(url.searchParams.get('cursor') ?? 'null')).toEqual(cursor);
  expect(document.body.textContent).not.toContain('AUTHOR_SENTINEL');
});

test('reloads second-page versions after a conflict without rebasing a dirty draft until explicit discard', async () => {
  // Given
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: row.id };
  const older = { ...row, id: 'feedback-2', title: 'Second-page feedback' };
  const latest = { ...older, reply: 'Current server reply', version: 2 };
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [older], nextCursor: null } }))
    .mockResolvedValueOnce(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...row, content: 'Refreshed first page' }], nextCursor: cursor } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [latest], nextCursor: null } }))
    .mockResolvedValueOnce(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { id: older.id, version: 3 } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [row], nextCursor: cursor } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...latest, reply: 'Merged reply', version: 3 }], nextCursor: null } }));
  vi.stubGlobal('fetch', fetch);
  render(<AdminFeedbackPanel ownerId="admin" feedback={[row]} nextCursor={cursor} />);
  fireEvent.click(screen.getByRole('button', { name: '載入更多管理建言' }));
  const article = (await screen.findByText(older.title)).closest('article');
  if (!article) throw new TypeError('Missing second-page feedback');
  const editor = within(article);
  fireEvent.change(editor.getByRole('textbox'), { target: { value: 'Unreconciled draft' } });
  fireEvent.click(editor.getByRole('button', { name: '發布/更新回覆' }));
  expect(await editor.findByRole('alert')).toHaveTextContent(/草稿已保留.*重新載入/);
  // When
  fireEvent.click(editor.getByRole('button', { name: '重新載入最新資料' }));
  // Then
  expect(await editor.findByRole('button', { name: '捨棄草稿並使用最新內容' })).toBeVisible();
  expect(screen.getByText('Refreshed first page')).toBeVisible();
  expect(editor.getByRole('textbox')).toHaveValue('Unreconciled draft');
  const reloadUrl = new URL(String(fetch.mock.calls[3]?.[0]), 'http://localhost');
  expect(JSON.parse(reloadUrl.searchParams.get('cursor') ?? 'null')).toEqual(cursor);
  fireEvent.click(editor.getByRole('button', { name: '發布/更新回覆' }));
  await editor.findByRole('button', { name: '發布/更新回覆' });
  expect(JSON.parse(String(fetch.mock.calls[4]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply',
    payload: { id: older.id, reply: 'Unreconciled draft', expectedVersion: 1 } });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(editor.getByRole('button', { name: '捨棄草稿並使用最新內容' }));
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(editor.getByRole('textbox')).toHaveValue(latest.reply);
  fireEvent.change(editor.getByRole('textbox'), { target: { value: 'Merged reply' } });
  fireEvent.click(editor.getByRole('button', { name: '發布/更新回覆' }));
  expect(await editor.findByRole('status')).toHaveTextContent('操作已成功完成。');
  expect(JSON.parse(String(fetch.mock.calls[5]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply',
    payload: { id: older.id, reply: 'Merged reply', expectedVersion: 2 } });
  expect(editor.getByRole('textbox')).toHaveValue('Merged reply');
  expect(fetch).toHaveBeenCalledTimes(8);
});

test.each(['known', 'legacy_unverified', 'unknown'] as const)('reveals only reliable attribution after an explicit admin action (%s)', async attribution => {
  // Given
  const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, data: {
    attribution, user_id: 'PRIVATE_UUID', email: 'PRIVATE_EMAIL', display_name: 'PRIVATE_NAME',
  } }));
  vi.stubGlobal('fetch', fetch);
  render(<AdminFeedbackPanel ownerId="admin" feedback={[{ ...row, is_anonymous: true }]} nextCursor={null} />);
  expect(fetch).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toMatch(/PRIVATE_UUID|PRIVATE_EMAIL|PRIVATE_NAME/);
  // When
  fireEvent.click(screen.getByRole('button', { name: '查看作者（僅管理員）' }));
  // Then
  await screen.findByRole('button', { name: '隱藏作者資料' });
  expect(fetch).toHaveBeenCalledOnce();
  const url = new URL(String(fetch.mock.calls[0]?.[0]), 'http://localhost');
  expect(url.pathname).toBe('/api/rights/authors');
  expect(url.searchParams.get('kind')).toBe('feedback');
  expect(url.searchParams.get('id')).toBe(row.id);
  if (attribution === 'known') expect(screen.getByText('PRIVATE_EMAIL')).toBeVisible();
  else {
    expect(document.body.textContent).not.toMatch(/PRIVATE_UUID|PRIVATE_EMAIL|PRIVATE_NAME/);
    expect(screen.getByText(/無法.*還原身分/)).toBeVisible();
  }
  expect(screen.getByText('發布者：匿名同學')).toBeVisible();
});

test('never fetches or renders author identity for a nonadmin even with stale server props', () => {
  // Given
  const identity = { id: 'admin', email: 'student@nehs.hc.edu.tw', displayName: 'student', isAdmin: false };
  mocks.auth = { status: 'verified', identity, user: identity, generation: 2, isAdmin: false, isLoggedIn: true };
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  // When
  mount();
  // Then
  expect(screen.queryByText(row.content)).toBeNull();
  expect(screen.queryByRole('button', { name: /查看作者/ })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test('discards delayed author results when the admin session changes', async () => {
  // Given
  let finish: (response: Response) => void = () => { throw new Error('Missing author lookup'); };
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: /查看作者/ }));
  // When
  mocks.auth = auth('other-admin', 2);
  view.rerender(<AdminFeedbackPanel ownerId="admin" feedback={[row]} nextCursor={null} />);
  await act(async () => finish(Response.json({ ok: true, data: { attribution: 'known', user_id: 'stale', email: 'STALE_IDENTITY', display_name: 'stale' } })));
  // Then
  expect(document.body.textContent).not.toContain('STALE_IDENTITY');
  expect(screen.queryByText(row.content)).toBeNull();
});

test('adopts newer server versions for a clean acknowledged reply instead of keeping a stale write base', async () => {
  // Given
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: { id: row.id, version: 2 } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...row, reply: 'Saved reply', version: 2 }], nextCursor: null } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { id: row.id, version: 4 } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...row, reply: 'Next edit', version: 4 }], nextCursor: null } }));
  vi.stubGlobal('fetch', fetch);
  const view = mount(); submit('Saved reply');
  expect(await screen.findByRole('status')).toHaveTextContent('操作已成功完成。');
  // When
  view.rerender(<AdminFeedbackPanel ownerId="admin" feedback={[{ ...row, reply: 'Newest reply', version: 3 }]} nextCursor={null} />);
  submit('Next edit');
  // Then
  await waitFor(() => expect(screen.getByRole('button', { name: '發布/更新回覆' })).toBeEnabled());
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply',
    payload: { id: row.id, reply: 'Next edit', expectedVersion: 3 } });
});

test('retains the twentieth admin draft and original base after an insert moves the row to a continuation', async () => {
  // Given a full first page whose oldest row has an unsaved reply.
  const first = Array.from({ length: 19 }, (_, index) => ({ ...row, id: `first-${index}`, title: `First ${index}` }));
  const initial = [...first, row];
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: 'first-18' };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: {
    items: [{ ...row, id: 'new', title: 'Newer inserted feedback' }, ...first], nextCursor: cursor,
  } })).mockResolvedValueOnce(Response.json({ ok: true, data: {
    items: [{ ...row, reply: 'Concurrent server reply', version: 2 }], nextCursor: null,
  } })).mockResolvedValueOnce(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  render(<AdminFeedbackPanel ownerId="admin" feedback={initial} nextCursor={null} />);
  const article = screen.getByText(row.title).closest('article');
  if (!article) throw new TypeError('Missing twentieth feedback');
  fireEvent.change(within(article).getByRole('textbox'), { target: { value: 'Unsaved admin draft' } });
  // When the same page count is refreshed after a newer insert, then continued.
  fireEvent.click(screen.getByRole('button', { name: '重新載入建言清單' }));
  await screen.findByText('Newer inserted feedback');
  expect(screen.queryByText(row.title)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '載入更多管理建言' }));
  const restored = (await screen.findByText(row.title)).closest('article');
  if (!restored) throw new TypeError('Missing restored feedback');
  const editor = within(restored);
  // Then remount preserves both the input and the version it was edited against.
  expect(editor.getByRole('textbox')).toHaveValue('Unsaved admin draft');
  expect(editor.getByRole('button', { name: '捨棄草稿並使用最新內容' })).toBeVisible();
  fireEvent.click(editor.getByRole('button', { name: '發布/更新回覆' }));
  await editor.findByRole('alert');
  expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply',
    payload: { id: row.id, reply: 'Unsaved admin draft', expectedVersion: 1 } });
  expect(JSON.parse(new URL(String(fetch.mock.calls[1]?.[0]), 'http://localhost').searchParams.get('cursor') ?? 'null')).toEqual(cursor);
});

test.each(['identity', 'generation'] as const)('does not expose an admin draft after an auth %s scope change', async change => {
  // Given a draft belonging only to the current verified session.
  const view = mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Session-only admin draft' } });
  const nextId = change === 'identity' ? 'other-admin' : 'admin';
  mocks.auth = auth(nextId, change === 'generation' ? 2 : 1);
  // When the same entity is rendered for a different owner/session.
  view.rerender(<AdminFeedbackPanel ownerId={nextId} feedback={[row]} nextCursor={null} />);
  // Then neither the new owner nor a subsequent return recovers the old draft.
  expect(screen.getByRole('textbox')).toHaveValue(row.reply);
  mocks.auth = auth();
  view.rerender(<AdminFeedbackPanel ownerId="admin" feedback={[row]} nextCursor={null} />);
  expect(screen.getByRole('textbox')).toHaveValue(row.reply);
});

test('retains a clean acknowledged receipt across row movement until the server version catches up', async () => {
  // Given a committed reply whose refresh moves the row out of the loaded page.
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: 'new' };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ok: true, data: { id: row.id, version: 2 } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [{ ...row, id: 'new', title: 'New first row' }], nextCursor: cursor } }))
    .mockResolvedValueOnce(Response.json({ ok: true, data: { items: [row], nextCursor: null } }))
    .mockResolvedValueOnce(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }));
  vi.stubGlobal('fetch', fetch);
  mount();
  // When the save unmounts the editor, followed by an older continuation snapshot.
  submit('Acknowledged reply');
  await screen.findByText('New first row');
  expect(screen.queryByText(row.title)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '載入更多管理建言' }));
  const article = (await screen.findByText(row.title)).closest('article');
  if (!article) throw new TypeError('Missing acknowledged feedback');
  const editor = within(article);
  // Then the clean receipt still supplies the saved value and next write base.
  expect(editor.getByRole('textbox')).toHaveValue('Acknowledged reply');
  expect(editor.queryByRole('button', { name: '捨棄草稿並使用最新內容' })).toBeNull();
  fireEvent.change(editor.getByRole('textbox'), { target: { value: 'Next reply' } });
  fireEvent.click(editor.getByRole('button', { name: '發布/更新回覆' }));
  await editor.findByRole('alert');
  expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toEqual({ action: 'saveFeedbackReply',
    payload: { id: row.id, reply: 'Next reply', expectedVersion: 2 } });
});
