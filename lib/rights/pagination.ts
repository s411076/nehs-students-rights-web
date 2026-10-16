import { makeFailure, makeSuccess, type RightsResult } from './contracts';
import { countCodePoints, validateId } from './validation';

export type PageCursor = { readonly created_at: string; readonly id: string };
export type Page<T> = { readonly items: T[]; readonly nextCursor: PageCursor | null };
export type PageOptions = { readonly limit?: number; readonly cursor?: PageCursor | null; readonly query?: string };
export type PageParameters = { readonly p_limit: number; readonly p_cursor: PageCursor | null; readonly p_query: string };

export function parseCursor(value: unknown): PageCursor | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value) ||
      !('created_at' in value) || !('id' in value) || Object.keys(value).length !== 2) return null;
  if (typeof value.created_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value.created_at) ||
      !Number.isFinite(Date.parse(value.created_at))) return null;
  const day = value.created_at.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day) return null;
  const id = validateId(value.id);
  return id.ok ? { created_at: value.created_at, id: id.data } : null;
}

export function parsePage<T>(data: unknown, itemParser: (item: unknown) => T | null): Page<T> | null {
  if (typeof data !== 'object' || data === null || !('items' in data) || !('nextCursor' in data) ||
      !Array.isArray(data.items)) return null;
  const cursor = data.nextCursor === null ? null : parseCursor(data.nextCursor);
  if (data.nextCursor !== null && cursor === null) return null;
  const items: T[] = [];
  for (const item of data.items) {
    const parsed = itemParser(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return { items, nextCursor: cursor };
}

export function parsePageParameters(params: URLSearchParams): RightsResult<PageParameters> {
  if (['limit', 'cursor', 'query'].some(key => params.getAll(key).length > 1)) return makeFailure('INVALID_PAYLOAD');
  const rawLimit = params.get('limit');
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit)) return makeFailure('INVALID_PAYLOAD');
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) return makeFailure('INVALID_PAYLOAD');
  const query = params.get('query') ?? '';
  if (countCodePoints(query) > 100) return makeFailure('INVALID_PAYLOAD');
  let cursor: PageCursor | null = null;
  const rawCursor = params.get('cursor');
  if (rawCursor !== null) {
    try { cursor = parseCursor(JSON.parse(rawCursor)); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    if (cursor === null) return makeFailure('INVALID_PAYLOAD');
  }
  return makeSuccess({ p_limit: limit, p_cursor: cursor, p_query: query });
}

export function pagePath(base: string, options: PageOptions = {}): string {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', JSON.stringify(options.cursor));
  if (options.query !== undefined) params.set('query', options.query);
  const suffix = params.toString();
  return suffix ? `${base}?${suffix}` : base;
}
