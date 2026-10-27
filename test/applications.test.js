const test = require('node:test'), assert = require('node:assert/strict');
const { Applications, metadataTarget, parseProcesses, owningApp, processTarget, readMetadata } = require('../overlay/applications');
const { Collector } = require('../overlay/collector');
test('desktop originator takes precedence over the shared vscode source', () => {
  assert.equal(metadataTarget({ client: 'Codex Desktop' }, 'codex'), 'com.openai.codex');
  assert.equal(metadataTarget({ client: 'codex_vscode' }, 'codex'), 'com.microsoft.VSCode');
  assert.equal(metadataTarget({ client: 'claude-vscode' }, 'claude'), 'com.microsoft.VSCode');
  assert.equal(metadataTarget({ client: 'cli' }, 'codex'), '');
});
test('large context records do not hide the application metadata', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-app-')), file = path.join(dir, 'session.jsonl');
  try {
    fs.writeFileSync(file, JSON.stringify({ type: 'user', message: 'x'.repeat(300000) }) + '\n' + JSON.stringify({ cwd: '/project', entrypoint: 'claude-desktop' }) + '\n');
    assert.deepEqual(readMetadata(file, false), { cwd: '/project', client: 'claude-desktop' });
    fs.writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { cwd: '/project', originator: 'Codex Desktop', source: 'vscode', context: 'x'.repeat(300000) } }) + '\n');
    assert.deepEqual(readMetadata(file, true), { cwd: '/project', client: 'Codex Desktop' });
  } finally { fs.rmSync(dir, { force: true, recursive: true }); }
});
test('CLI ancestry resolves a terminal and refuses ambiguous applications sharing a directory', () => {
  const processes = parseProcesses(' 10 1 /Applications/iTerm.app/Contents/MacOS/iTerm2\n 11 10 /bin/zsh\n 12 11 /usr/local/bin/claude\n 20 1 /Applications/Visual Studio Code.app/Contents/MacOS/Code\n 21 20 /usr/local/bin/claude');
  const apps = [{ pid: 10, bundle: 'com.googlecode.iterm2' }, { pid: 20, bundle: 'com.microsoft.VSCode' }];
  assert.equal(owningApp(12, processes, apps).bundle, 'com.googlecode.iterm2');
  assert.equal(processTarget({ cwd: '/project' }, 'claude', processes, apps, new Map([[12, '/project'], [21, '/other']])), 'com.googlecode.iterm2');
  assert.equal(processTarget({ cwd: '/project' }, 'claude', processes, apps, new Map([[12, '/project'], [21, '/project']])), '');
});
test('activation only uses a remembered bundle, and reports closed applications', async () => {
  const calls = [], execute = async (file, args) => { calls.push([file, args]); return { stdout: JSON.stringify({ ok: true, name: 'Visual Studio Code' }) }; };
  const a = new Applications('/helper', execute);
  assert.equal((await a.activate('unknown')).ok, false); assert.equal(calls.length, 0);
  a.bindings.set('_codex/root', 'com.microsoft.VSCode');
  assert.equal((await a.activate('_codex/root')).ok, true);
  assert.deepEqual(calls, [['/helper', ['--activate', 'com.microsoft.VSCode']]]);
  a.execute = async () => { throw { stdout: JSON.stringify({ ok: false, error: 'L’application est fermée.' }) }; };
  assert.equal((await a.activate('_codex/root')).error, 'L’application est fermée.');
});
test('collector labels the host app and links child avatars to their parent session', () => {
  const now = Date.now(), row = { proj: '-project', id: 'root', title: 'Task', mtime: now, state: 'turn' };
  const core = { boardRows: () => [row], timeline: () => ({ agents: [{ id: 'main' }, { id: 'child', name: 'Ada' }], events: [
    { kind: 'say', agent: 'main', ts: now, text: 'Done', end: true },
    { kind: 'report', agent: 'child', ts: now, text: 'Done' },
  ] }) };
  const applications = { describe: () => ({ applicationKey: '-project/root', applicationLabel: 'VS Code', applicationAvailable: true }) };
  const views = new Collector(core, applications).snapshot('all', now).agents;
  assert.equal(views.find(a => a.agentId === 'main').name, 'Claude VS Code');
  assert.equal(views.find(a => a.agentId === 'child').name, 'Ada');
  assert.ok(views.every(a => a.applicationKey === '-project/root'));
});
