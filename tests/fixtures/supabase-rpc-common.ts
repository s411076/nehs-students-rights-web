import type { User } from '@supabase/supabase-js';
import type { FixtureData, Row } from './supabase-data.ts';

// Offline contract simulation only. This is not PostgreSQL/RLS evidence.
export class FixtureRpcError extends Error {
  readonly status: 400 | 401 | 403 | 409;
  constructor(status: 400 | 401 | 403 | 409, message: string) {
    super(message);
    this.status = status;
  }
  get code() { return `PT${this.status}`; }
}
export function text(value: unknown, max = 5000): string {
  if (typeof value !== 'string') throw new FixtureRpcError(400, 'Invalid text');
  const result = value.trim();
  if (Array.from(result).length > max) throw new FixtureRpcError(400, 'Invalid text');
  return result;
}
export function requiredText(value: unknown, max = 5000) {
  const result = text(value, max);
  if (!result) throw new FixtureRpcError(400, 'Required text');
  return result;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new FixtureRpcError(400, 'Invalid boolean');
  return value;
}
export function eligible(user: User | undefined): User {
  if (!user) throw new FixtureRpcError(401, 'Authentication required');
  if (!user.email_confirmed_at || !/^[^@\s]+@nehs\.hc\.edu\.tw$/i.test(user.email ?? '')) throw new FixtureRpcError(403, 'School identity required');
  return user;
}
export function isAdmin(data: FixtureData, user: User | undefined) {
  return Boolean(user?.email_confirmed_at && /^[^@\s]+@nehs\.hc\.edu\.tw$/i.test(user.email ?? '') &&
    data.tables.admins.filter(row => row.email === user?.email).length === 1);
}
export function admin(data: FixtureData, user: User | undefined) {
  const actor = eligible(user);
  if (!isAdmin(data, actor)) throw new FixtureRpcError(403, 'Administrator required');
  return actor;
}
export function publicProposal(row: Row) {
  return ['處理中', '已結案'].includes(String(row.status));
}
export function target(rows: readonly Row[], id: unknown) {
  const key = requiredText(id, 128);
  const row = rows.find(item => item.id === key);
  if (!row) throw new FixtureRpcError(409, 'Target unavailable');
  return row;
}
export function versioned(row: Row, expected: unknown) {
  if (!Number.isSafeInteger(expected) || Number(expected) < 1) throw new FixtureRpcError(400, 'Invalid version');
  if (row.version !== expected) throw new FixtureRpcError(409, 'Stale version');
}
export function recordWrite(data: FixtureData, kind: 'insert' | 'update' | 'delete') {
  data.counters[kind]++; data.counters.total++;
}
