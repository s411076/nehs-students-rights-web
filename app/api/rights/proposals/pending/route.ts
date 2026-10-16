import type { NextRequest } from 'next/server';
import { rightsReadRoute } from '@/lib/rights/server-reads';
export function GET(request: NextRequest) { return rightsReadRoute(request, 'pending'); }
