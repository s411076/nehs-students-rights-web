import type { NextRequest } from 'next/server';
import { rightsQueueRoute } from '@/lib/rights/server-reads';
export function GET(request: NextRequest) { return rightsQueueRoute(request); }
