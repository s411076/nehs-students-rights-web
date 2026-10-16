import type { User } from '@supabase/supabase-js';

export const fakePublishableKey = 'sb_publishable_offline_fixture_only';
export const fixtureUsers = {
  student: user('student', 'student@nehs.hc.edu.tw'),
  admin: user('admin', 'admin@nehs.hc.edu.tw'),
  outsider: user('outsider', 'outsider@example.test'),
  unconfirmed: { ...user('unconfirmed', 'unconfirmed@nehs.hc.edu.tw'), email_confirmed_at: undefined },
} satisfies Record<string, User>;
export type FixtureIdentity = keyof typeof fixtureUsers;

function user(id: string, email: string): User {
  return { id, email, aud: 'authenticated', role: 'authenticated',
    created_at: '2026-01-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: {}, user_metadata: { full_name: `Fixture ${id}`, cookie_chunk_padding: 'x'.repeat(4000) } };
}

export type Row = Record<string, unknown>;
// Mutable state is intentional: each provider owns a fresh database and counters.
export function createFixtureData() {
  const tables: Record<string, Row[]> = {};
  const counters = { insert: 0, update: 0, delete: 0, total: 0 };
  const requests: { method: string; path: string; token: string }[] = [];
  const rpcCounters = { read: 0, mutation: 0 };
  const legacyVotes = new Map<string, number>();
  const votes = new Map<string, Set<string>>();
  const authors = new Map<string, User>();
  function reset() {
    Object.assign(counters, { insert: 0, update: 0, delete: 0, total: 0 });
    requests.length = 0;
    Object.assign(rpcCounters, { read: 0, mutation: 0 });
    legacyVotes.clear(); votes.clear(); authors.clear();
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, {
      admins: [{ email: fixtureUsers.admin.email }],
      home_sections: [{ id: 'section-1', title: 'Offline fixture announcement', content: 'Fixture home content', created_at: '2026-01-01T00:00:00Z' }],
      proposals: ['研議中', '待審核', '被退回', 'unknown'].map((status, index) => ({
        id: `proposal-${index + 1}`, title: `Fixture ${status}`, content: 'Fixture proposal', status,
        author_name: 'Fixture student', is_anonymous: false, upvotes_count: 0, reply: '', created_at: '2026-01-01T00:00:00Z', secret: 'PRIVATE_SENTINEL',
      })),
      feedback: [{ id: 'feedback-1', title: 'Fixture feedback', content: 'Fixture suggestion', category: '其他', is_anonymous: true,
        author_name: 'ANONYMOUS_AUTHOR_SENTINEL', reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z' }],
      proposal_comments: [{ id: 'comment-1', proposal_id: 'proposal-1', content: 'Fixture comment', author_name: 'Fixture student', is_anonymous: false, created_at: '2026-01-01T00:00:00Z' }],
    });
    for (const rows of Object.values(tables)) for (const row of rows) row.version = 1;
    for (const row of tables.proposals) legacyVotes.set(String(row.id), Number(row.upvotes_count));
  }
  reset();
  return { tables, counters, requests, rpcCounters, legacyVotes, votes, authors, reset };
}
export type FixtureData = ReturnType<typeof createFixtureData>;
