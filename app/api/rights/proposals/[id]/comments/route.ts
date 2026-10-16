import type { NextRequest } from 'next/server';
import { rightsReadRoute } from '@/lib/rights/server-reads';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return rightsReadRoute(request, 'comments', id);
}
