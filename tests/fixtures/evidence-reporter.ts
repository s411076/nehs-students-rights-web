import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

export default class EvidenceReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    if (!test.title.includes('harness smoke') || result.status !== 'passed') return;
    const trace = result.attachments.find(attachment => attachment.name === 'trace');
    if (!trace?.path) throw new TypeError('Passing harness must retain a trace');
    const directory = resolve('.omo/evidence/source-security-remediation/task-1');
    mkdirSync(directory, { recursive: true });
    copyFileSync(trace.path, resolve(directory, 'trace.zip'));
  }
}
