import { render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import ProfilePage from '../../app/profile/page';

const authState = vi.hoisted(() => ({
  current: { status: 'loading', identity: null, generation: 0 } as {
    status: 'loading' | 'anonymous' | 'verified' | 'ineligible' | 'unavailable';
    identity: { id: string; email: string; displayName: string; isAdmin: boolean } | null;
    generation: number;
  },
}));
vi.mock('@/components/AuthProvider', () => ({
  useAuth: () => ({
    ...authState.current,
    user: authState.current.identity,
    isAdmin: authState.current.identity?.isAdmin === true,
    isLoggedIn: authState.current.status === 'verified',
  }),
}));

// Legacy-path spy: the fixed page must never touch the database client.
// The pre-fix page scans localStorage/cookies/JWT and queries proposals,
// so these fixtures drive the RED demonstration of fuzzy claiming.
const supabaseSpy = vi.hoisted(() => ({
  fromCalls: [] as string[],
  session: null as { user: { email: string; user_metadata?: Record<string, string> } } | null,
  proposals: [] as Array<Record<string, string>>,
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: supabaseSpy.session } }),
      getUser: async () => ({ data: { user: supabaseSpy.session?.user ?? null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (table: string) => {
      supabaseSpy.fromCalls.push(table);
      return { select: () => ({ order: async () => ({ data: supabaseSpy.proposals }) }) };
    },
  }),
}));

const verified = (displayName: string, email: string, generation: number) => {
  authState.current = {
    status: 'verified',
    identity: { id: `id-${email}`, email, displayName, isAdmin: false },
    generation,
  };
};

function forgedJwt(email: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ email, user_metadata: { full_name: '冒名者' } }));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `eyJhbGciOiJ9.${btoa(binary)}.sig`;
}

beforeEach(() => {
  authState.current = { status: 'loading', identity: null, generation: 0 };
  supabaseSpy.session = null;
  supabaseSpy.proposals = [];
  supabaseSpy.fromCalls = [];
  localStorage.clear();
});

test('verified user sees identity plus unavailable-ownership notice with zero proposal queries', async () => {
  // Given a server-verified school identity
  verified('王小明', 'wang@nehs.hc.edu.tw', 3);
  // When
  render(<ProfilePage />);
  // Then identity comes only from the provider, never from token payloads
  expect(await screen.findByText('王小明')).toBeInTheDocument();
  expect(screen.getByText('wang@nehs.hc.edu.tw')).toBeInTheDocument();
  const notice = screen.getByTestId('profile-ownership-unavailable');
  expect(notice.textContent).toMatch(/無法.*本人提案/);
  expect(notice.textContent).toMatch(/UUID/);
  expect(screen.queryByText(/我發表的提案 \(/)).toBeNull();
  expect(supabaseSpy.fromCalls).toEqual([]);
});

test('similar name or email prefix never becomes my proposal', async () => {
  // Given a legacy session plus proposals by lookalike authors
  supabaseSpy.session = { user: { email: 'wang@nehs.hc.edu.tw', user_metadata: { full_name: '王小明' } } };
  supabaseSpy.proposals = [
    { id: 'p1', title: '別人的相似提案', author_name: '王小明大', status: '處理中' },
    { id: 'p2', title: '前綴相似提案', author_name: 'wang', status: '處理中' },
  ];
  verified('王小明', 'wang@nehs.hc.edu.tw', 3);
  // When
  render(<ProfilePage />);
  // Then no fuzzy ownership is claimed and no query runs at all
  expect(await screen.findByTestId('profile-ownership-unavailable')).toBeInTheDocument();
  expect(screen.queryByText('別人的相似提案')).toBeNull();
  expect(screen.queryByText('前綴相似提案')).toBeNull();
  expect(supabaseSpy.fromCalls).toEqual([]);
});

test('forged stored identity and JWT payload are ignored while anonymous', async () => {
  // Given forged browser material with no server session
  localStorage.setItem('sb-forged-auth', JSON.stringify({ user: { email: 'forged@nehs.hc.edu.tw', user_metadata: { full_name: '冒名者' } } }));
  localStorage.setItem('sb-forged-jwt', forgedJwt('jwt-forged@nehs.hc.edu.tw'));
  authState.current = { status: 'anonymous', identity: null, generation: 5 };
  // When
  render(<ProfilePage />);
  // Then the forged names never surface and nothing is queried
  expect(await screen.findByText(/尚未登入/)).toBeInTheDocument();
  expect(screen.queryByText('冒名者')).toBeNull();
  expect(screen.queryByText('forged@nehs.hc.edu.tw')).toBeNull();
  expect(screen.queryByText('jwt-forged@nehs.hc.edu.tw')).toBeNull();
  expect(supabaseSpy.fromCalls).toEqual([]);
});

test('prior identity clears on account switch and logout', async () => {
  // Given Alice verified
  verified('陳小美', 'chen@nehs.hc.edu.tw', 1);
  const view = render(<ProfilePage />);
  expect(await screen.findByText('陳小美')).toBeInTheDocument();
  // When the provider generation advances to Bob
  verified('林大華', 'lin@nehs.hc.edu.tw', 2);
  view.rerender(<ProfilePage />);
  // Then Alice is gone and Bob is shown
  expect(await screen.findByText('林大華')).toBeInTheDocument();
  expect(screen.queryByText('陳小美')).toBeNull();
  expect(screen.queryByText('chen@nehs.hc.edu.tw')).toBeNull();
  // When logging out
  authState.current = { status: 'anonymous', identity: null, generation: 3 };
  view.rerender(<ProfilePage />);
  // Then Bob is gone too
  expect(await screen.findByText(/尚未登入/)).toBeInTheDocument();
  expect(screen.queryByText('林大華')).toBeNull();
  expect(screen.queryByText('lin@nehs.hc.edu.tw')).toBeNull();
  expect(supabaseSpy.fromCalls).toEqual([]);
});

test.each([
  ['ineligible', /不符合.*學校/],
  ['unavailable', /無法確認|稍後再試/],
  ['loading', /確認中/],
] as const)('%s state is explicit with no identity and no queries', async (status, pattern) => {
  // Given
  authState.current = { status, identity: null, generation: 7 };
  // When
  render(<ProfilePage />);
  // Then
  expect(await screen.findByText(pattern)).toBeInTheDocument();
  expect(screen.queryByTestId('profile-ownership-unavailable')).toBeNull();
  expect(supabaseSpy.fromCalls).toEqual([]);
});
