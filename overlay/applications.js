'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const run = promisify(execFile);
const codex = require('../codex');
const keyOf = row => row.proj + '/' + row.id;
const VSCODE = 'com.microsoft.VSCode', CODEX = 'com.openai.codex', CLAUDE = 'com.anthropic.claudefordesktop';
const appLabel = bundle => ({ [VSCODE]: 'VS Code', [CODEX]: 'Desktop', [CLAUDE]: 'Desktop',
  'com.microsoft.VSCodeInsiders': 'VS Code Insiders', 'com.todesktop.230313mzl4w4u92': 'Cursor',
  'com.googlecode.iterm2': 'iTerm', 'com.apple.Terminal': 'Terminal' }[bundle] || '');

function readMetadata(file, isCodex) {
  let fd;
  try {
    fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const find = text => {
      for (const line of text.split('\n')) {
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (isCodex && r.type === 'session_meta') {
          const p = r.payload || {}; return { cwd: p.cwd || '', client: p.originator || p.source || '' };
        }
        if (!isCodex && r.cwd) return { cwd: r.cwd, client: r.entrypoint || '' };
      }
      return null;
    };
    const head = buf.subarray(0, n).toString('utf8'), metadata = find(head);
    if (metadata) return metadata;
    if (isCodex && /"type":"session_meta"/.test(head.slice(0, 400))) {
      const value = key => { const match = head.match(new RegExp('"' + key + '":"((?:[^"\\\\]|\\\\.)*)"')); return match ? JSON.parse('"' + match[1] + '"') : ''; };
      return { cwd: value('cwd'), client: value('originator') || value('source') };
    }
    // Large initial user/context records can hide Claude's first complete event.
    // Each later event repeats cwd and entrypoint, so a bounded tail suffices.
    const size = fs.fstatSync(fd).size;
    if (!isCodex && size > n) {
      const offset = Math.max(0, size - buf.length), count = fs.readSync(fd, buf, 0, buf.length, offset);
      const tail = buf.subarray(0, count).toString('utf8');
      return find(offset ? tail.slice(tail.indexOf('\n') + 1) : tail);
    }
  } catch {} finally { if (fd != null) fs.closeSync(fd); }
  return null;
}
function metadataTarget(meta, source) {
  const client = typeof meta?.client === 'string' ? meta.client : '';
  if (/desktop/i.test(client)) return source === 'codex' ? CODEX : CLAUDE;
  if (/vscode/i.test(client)) return VSCODE;
  return '';
}
function parseProcesses(text) {
  return text.split('\n').flatMap(line => {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    return m ? [{ pid: +m[1], parent: +m[2], command: m[3].trim() }] : [];
  });
}
function owningApp(pid, processes, apps) {
  const byPid = new Map(processes.map(p => [p.pid, p])), seen = new Set();
  while (pid && !seen.has(pid)) {
    seen.add(pid); const app = apps.find(a => a.pid === pid);
    if (app) return app;
    pid = byPid.get(pid)?.parent;
  }
  return null;
}
// Unknown CLI clients need their process ancestry, rather than a guessed terminal.
function processTarget(meta, source, processes, apps, directories) {
  if (!meta?.cwd) return '';
  const candidates = processes.filter(p => path.basename(p.command).toLowerCase() === source);
  const exact = candidates.filter(p => directories.get(p.pid) === meta?.cwd);
  const owners = exact.map(p => owningApp(p.pid, processes, apps)).filter(Boolean);
  const unique = [...new Map(owners.map(a => [a.bundle, a])).values()];
  return unique.length === 1 ? unique[0].bundle : '';
}
class Applications {
  constructor(helper, execute = run) {
    this.helper = helper; this.execute = execute; this.apps = []; this.processes = [];
    this.directories = new Map(); this.metadata = new Map(); this.bindings = new Map(); this.refreshing = null;
  }
  async refresh() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refreshInventory().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async refreshInventory() {
    if (process.platform !== 'darwin') return;
    const options = { timeout: 2500, maxBuffer: 1024 * 1024 };
    const [apps, ps] = await Promise.allSettled([
      this.execute(this.helper, ['--list'], options),
      this.execute('/bin/ps', ['-axo', 'pid=,ppid=,comm='], options),
    ]);
    if (apps.status === 'fulfilled') try { this.apps = JSON.parse(apps.value.stdout); } catch {}
    if (ps.status === 'fulfilled') this.processes = parseProcesses(ps.value.stdout);
    const pids = this.processes.filter(p => ['claude', 'codex'].includes(path.basename(p.command).toLowerCase())).map(p => p.pid);
    this.directories = new Map();
    if (pids.length) try {
      const { stdout } = await this.execute('/usr/sbin/lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'], options);
      let pid; for (const line of stdout.split('\n')) {
        if (line.startsWith('p')) pid = +line.slice(1);
        if (line.startsWith('n') && pid) this.directories.set(pid, line.slice(1));
      }
    } catch {}
  }
  describe(row) {
    const key = keyOf(row), source = row.proj === '_codex' ? 'codex' : 'claude';
    let meta = this.metadata.get(key);
    if (!meta) {
      const root = process.env.AGENT_STANDUP_PROJECTS || path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
      const file = source === 'codex' ? codex.fileOf(row.id) : path.join(root, row.proj, row.id + '.jsonl');
      if (file) meta = readMetadata(file, source === 'codex');
      if (meta) this.metadata.set(key, meta);
    }
    const explicit = metadataTarget(meta, source);
    const bundle = explicit || processTarget(meta, source, this.processes, this.apps, this.directories) || this.bindings.get(key) || '';
    if (bundle) this.bindings.set(key, bundle);
    const app = this.apps.find(a => a.bundle === bundle);
    return { applicationKey: key, applicationLabel: appLabel(bundle) || app?.name || '',
      applicationName: app?.name || (bundle === CODEX ? 'Codex' : bundle === CLAUDE ? 'Claude' : appLabel(bundle)), applicationAvailable: !!app };
  }
  async activate(key) {
    const bundle = this.bindings.get(key);
    if (!bundle) return { ok: false, error: 'L’application liée à cette session n’a pas pu être identifiée.' };
    try {
      const result = await this.execute(this.helper, ['--activate', bundle], { timeout: 3000, maxBuffer: 4096 });
      return JSON.parse(result.stdout);
    } catch (e) {
      try { return JSON.parse(e.stdout); } catch { return { ok: false, error: 'L’application liée est fermée ou indisponible.' }; }
    }
  }
}
module.exports = { Applications, metadataTarget, parseProcesses, owningApp, processTarget, readMetadata };
