import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { useAuth, useLogoutNotice } from '../../components/AuthProvider';
import { useVerification } from '../../components/VerificationContext';
import { adminIdentity, installOperationFetch, proposalRow } from './operation-lifecycle';
import { pendingQueuePage } from './queue-pages';

type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;
export const authEvents: { listener: AuthListener | undefined } = { listener: undefined };
export function verificationClient() {
  return { auth: { onAuthStateChange: (listener: AuthListener) => {
    authEvents.listener = listener;
    return { data: { subscription: { unsubscribe: () => { authEvents.listener = undefined; } } } };
  } } };
}

export function VerificationProbe() {
  const auth = useAuth();
  const verification = useVerification();
  const logout = useLogoutNotice();
  return <>
    <output data-testid="auth-scope" data-generation={auth.generation} data-status={auth.status}
      data-admin={String(auth.isAdmin)} data-email={auth.identity?.email} data-name={auth.identity?.displayName}>{auth.identity?.id}</output>
    <output data-testid="verification" data-epoch={verification.epoch} data-can-write={String(verification.canWrite)}>{verification.status}</output>
    <button type="button" onClick={logout.beginLogout}>Begin logout</button>
    <button type="button" onClick={logout.reportLogoutFailure}>Report logout failure</button>
  </>;
}

export const privateAuthor = { attribution: 'known', user_id: 'private-student', email: 'private@nehs.hc.edu.tw', display_name: 'Private student' } as const;
export function installVerificationNetwork() {
  const handlers: {
    session: () => Response | Promise<Response>;
    author: () => Response | Promise<Response>;
    action: (init: RequestInit) => Response | Promise<Response>;
    pending: (path: string) => Response | Promise<Response>;
  } = {
    session: () => Response.json(adminIdentity),
    author: () => Response.json({ ok: true, data: privateAuthor }),
    action: () => Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 }),
    pending: path => Response.json({ ok: true,
      data: pendingQueuePage([{ ...proposalRow, id: 'pending', title: 'Pending proposal', status: '待審核' }], path),
    }),
  };
  const operations = installOperationFetch(init => handlers.action(init));
  const fetcher = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    switch (url.pathname) {
      case '/api/rights/session': return handlers.session();
      case '/api/rights/authors': return handlers.author();
      case '/api/rights/home-sections': return Response.json({ ok: true, data: { items: [{
        id: 'h1', title: 'Announcement', content: 'Campus notice', created_at: proposalRow.created_at, version: 1,
      }], nextCursor: null } });
      case '/api/rights/queue':
        if (url.searchParams.get('kind') === 'pending') return handlers.pending(String(input));
    }
    return operations.fetcher(input, init);
  });
  vi.stubGlobal('fetch', fetcher);
  return { ...operations, handlers, fetcher,
    authorReads: () => fetcher.mock.calls.filter(([input]) => String(input).startsWith('/api/rights/authors')),
    sessionReads: () => fetcher.mock.calls.filter(([input]) => String(input) === '/api/rights/session'),
    pendingReads: () => fetcher.mock.calls.filter(([input]) => {
      const url = new URL(String(input), 'http://localhost');
      return url.pathname === '/api/rights/queue' && url.searchParams.get('kind') === 'pending';
    }),
  };
}
