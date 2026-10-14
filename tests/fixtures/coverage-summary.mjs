import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve('.omo/evidence/source-security-remediation/task-1/coverage');
const scripts = new Map();
for (const file of await readdir(directory)) {
  const report = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
  for (const script of report.result) {
    if (!script.url.includes('/tests/fixtures/supabase-') || script.url.includes('node_modules')) continue;
    scripts.set(script.url, script);
  }
}
console.log('Native Node V8 coverage (function counts; raw range coverage retained):');
for (const [url, script] of scripts) {
  const covered = script.functions.filter(fn => fn.ranges.some(range => range.count > 0)).length;
  console.log(`${url}: ${covered}/${script.functions.length} functions executed`);
}
if (scripts.size === 0) throw new TypeError('Expected fixture coverage output');
