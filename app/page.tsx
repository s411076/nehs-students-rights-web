'use client';

import { HomeIdentity } from '@/components/rights/HomeIdentity';
import { HomeSearch } from '@/components/rights/HomeSearch';
import { HomeSections } from '@/components/rights/HomeSections';

export default function HomePage() {
  return <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
    <main className="max-w-4xl mx-auto p-6">
      <div className="text-center my-8">
        <h1 className="text-3xl font-extrabold mb-2 text-balance">🎓 國立竹科實中 <span className="whitespace-nowrap">學生權益網</span></h1>
        <p className="text-gray-600 dark:text-slate-400 text-sm">維護學生權益・促進校園溝通・即時反映意見</p>
      </div>
      <HomeIdentity />
      <HomeSearch />
      <HomeSections />
    </main>
  </div>;
}
