import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const path = 'app/proposals/page.tsx';
const text = readFileSync(path, 'utf8');
const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let parser;
let loader;
let effect;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'parseProposals') parser = node.getText(source);
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'fetchProposals') {
    loader = node.initializer.arguments[0].getText(source);
  }
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' &&
      node.arguments[0]?.getText(source).includes('void fetchProposals().then')) {
    effect = node.arguments[0].getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(parser && loader && effect, 'Current source functions and effect must be found');

for (const kind of ['malformed', 'rejected']) {
  // Given: the real source loader/effect with a failed public read seam.
  const statuses = [];
  const unhandled = [];
  let readPromise;
  const query = {
    select() { return this; }, in() { return this; },
    order() {
      return kind === 'malformed'
        ? Promise.resolve({ data: { malformed: true }, error: null })
        : Promise.reject(new TypeError('Read rejected'));
    },
  };
  const context = {
    supabase: { from() { return query; } }, generation: 1,
    currentAuth: { current: { generation: 1 } }, mounted: { current: true },
    PUBLIC_STATUSES: ['研議中'], PROPOSAL_SELECT_STRING: 'id,title,status',
    makeFailure: code => ({ ok: false, code }),
    setPublicListStatus: status => statuses.push(status),
    capturePromise: promise => { readPromise = promise; return promise; },
  };
  const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    // When: the initial-load effect runs and its promise settles.
    const script = `${parser}\nconst load = ${loader};\nconst fetchProposals = () => capturePromise(load());\n(${effect})();`;
    const js = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(js, context);
    const result = await readPromise;
    await new Promise(resolve => setImmediate(resolve));
    // Then: all callers receive typed failure, and the effect owns rejection.
    assert.equal(result.ok, false);
    assert.equal(result.code, 'UNAVAILABLE');
    assert.deepEqual(statuses, ['loading', 'error']);
    assert.deepEqual(unhandled, []);
    console.log(`RESOLVED ${kind}: typed UNAVAILABLE; list state error; unhandled rejections: 0`);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
}
