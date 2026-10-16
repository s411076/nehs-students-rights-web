import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createReadOnlyClient } from '@/lib/supabase/server';
import { deriveDisplayName, isEligibleSchoolEmail, normalizeEmail } from './types';
import type { SessionIdentity } from './types';

export class AuthorizationError extends Error {
  constructor(readonly status: 401 | 403 | 503, readonly code: 'unauthenticated' | 'ineligible_identity' | 'admin_required' | 'role_unavailable') {
    super(code);
    this.name = 'AuthorizationError';
  }
}

export async function getVerifiedIdentity(client?: SupabaseClient): Promise<Readonly<SessionIdentity>> {
  const supabase = client ?? await createReadOnlyClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || typeof data.user.id !== 'string' || !data.user.id) {
    throw new AuthorizationError(401, 'unauthenticated');
  }
  const email = normalizeEmail(data.user.email);
  if (!isEligibleSchoolEmail(email, data.user.email_confirmed_at) || !/^[^\s@]+@nehs\.hc\.edu\.tw$/.test(email)) {
    throw new AuthorizationError(403, 'ineligible_identity');
  }
  return {
    id: data.user.id,
    email,
    displayName: deriveDisplayName({ email, metadata: data.user.user_metadata }),
    isAdmin: false,
  };
}

export async function requireAdmin(client?: SupabaseClient): Promise<Readonly<SessionIdentity>> {
  const supabase = client ?? await createReadOnlyClient();
  const identity = await getVerifiedIdentity(supabase);
  const { data, error } = await supabase.rpc('rights_is_admin');
  if (error) throw new AuthorizationError(503, 'role_unavailable');
  if (data !== true) {
    throw new AuthorizationError(403, 'admin_required');
  }
  return { ...identity, isAdmin: true };
}

export const getAdmin = requireAdmin;
