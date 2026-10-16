import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class EvidenceReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (!test.title.includes('harness smoke') || result.status !== 'passed') return;
    const directory = resolve('.omo/evidence/source-security-remediation/task-1');
    mkdirSync(directory, { recursive: true });
    const trace = result.attachments.find(attachment => attachment.name === 'trace');
    if (trace?.path) {
      copyFileSync(trace.path, resolve(directory, 'trace.zip'));
      return;
    }
    // The shared networkAudit fixture manages tracing itself (Playwright-level
    // tracing stays off to avoid double-start); its per-test trace lands here.
    const base = resolve('.omo/evidence/source-security-remediation/task-14');
    const suffix = test.title.replace(/[^a-zA-Z0-9-]/g, '_');
    let found: string | undefined;
    try {
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.endsWith(`-${suffix}`)) {
          const candidate = resolve(base, entry.name, 'trace.zip');
          if (existsSync(candidate)) { found = candidate; break; }
        }
      }
    } catch {
      // Missing evidence root: fall through to the strict error below.
    }
    if (!found) throw new TypeError('Passing harness must retain a trace');
    copyFileSync(found, resolve(directory, 'trace.zip'));
  }
}
