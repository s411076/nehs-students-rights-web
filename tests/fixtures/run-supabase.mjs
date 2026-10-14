import { startSupabaseFixture } from './supabase-server.ts';

const fixture = await startSupabaseFixture(Number(process.env.FIXTURE_PORT));
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { void fixture.close(); });
}
