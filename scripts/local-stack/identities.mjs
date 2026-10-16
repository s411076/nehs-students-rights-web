import { createHmac } from 'node:crypto';

// All identities are synthetic. No provider cache, environment or user data is read.
export const users = Object.fromEntries(
  ['studentA', 'studentB', 'admin', 'outsider', 'unconfirmed'].map((name, index) => [name, {
    id: `10000000-0000-4000-8000-00000000000${index + 1}`,
    email: `${name.toLowerCase()}@${name === 'outsider' ? 'example.invalid' : 'nehs.hc.edu.tw'}`,
    aud: 'authenticated', role: 'authenticated',
    email_confirmed_at: name === 'unconfirmed' ? null : '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'fixture' }, user_metadata: { name: `Synthetic ${name}` },
  }]),
);

export function sign(secret, claims) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function credentials(secret) {
  const iat = Math.floor(Date.now() / 1000);
  const common = { iss: 'synthetic-local-only', aud: 'authenticated', iat, exp: iat + 86400 };
  return Object.fromEntries([
    ['anon', sign(secret, { ...common, role: 'anon' })],
    ...Object.entries(users).map(([name, user]) => [name,
      sign(secret, { ...common, sub: user.id, role: 'authenticated', email: user.email })]),
  ]);
}
