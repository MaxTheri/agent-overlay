'use strict';
const { summarize, select } = require('./activity');
const codex = require('../codex');
class Collector {
  constructor(core, applications = null) { this.core = core; this.applications = applications; this.cache = new Map(); }
  snapshot(source = 'all', now = Date.now()) {
    const rows = this.core.boardRows().filter((r) => source === 'all' || (source === 'codex') === (r.proj === '_codex'));
    // Keep the upstream incremental timelines; many parallel chats should not
    // evict one another and reread their entire transcripts every second.
    const childrenByRoot = new Map(rows.filter((r) => r.proj === '_codex').map((r) => [r.id, codex.children(r.id)]));
    const childRows = new Map([...childrenByRoot.values()].flat().map(child => [child.id, codex.boardRow(child, now)]));
    const candidates = rows.filter((r) => r.turnOpen || r.state === 'blocked' || now - r.mtime < 10 * 60000 || r.subActive > 0 || (childrenByRoot.get(r.id) || []).some((c) => childRows.get(c.id)?.turnOpen || now - c.mtime < 10 * 60000)).slice(0, 12);
    const views = [], liveKeys = new Set();
    for (const row of candidates) {
      const key = row.proj + '/' + row.id; liveKeys.add(key);
      const signature = row.mtime + ':' + row.subActive + ':' + row.subTotal;
      let cached = this.cache.get(key);
      try {
        // Claude subagent files can change while the root stays quiet.
        if (!cached || cached.signature !== signature || row.subActive || now - cached.at > 15000) {
          cached = { signature, at: now, timeline: this.core.timeline(row.proj, row.id) }; this.cache.set(key, cached);
        }
        const application = this.applications?.describe(row) || {};
        const decorate = a => ({ ...a, ...application,
          name: a.agentId === 'main' && application.applicationLabel ? `${a.source === 'codex' ? 'Codex' : 'Claude'} ${application.applicationLabel}` : a.name });
        views.push(...summarize(cached.timeline, row, now).map(decorate));
        if (row.proj === '_codex') for (const child of childrenByRoot.get(row.id) || []) {
          const childKey = '_codex/' + child.id; liveKeys.add(childKey);
          let cc = this.cache.get(childKey);
          if (!cc || cc.signature !== child.mtime) { cc = { signature: child.mtime, timeline: this.core.timeline('_codex', child.id) }; this.cache.set(childKey, cc); }
          views.push(...summarize(cc.timeline, { ...childRows.get(child.id), title: row.title }, now).map((a) => ({ ...decorate(a), name: child.name || 'Agent Codex', role: child.role || 'Sous-agent' })));
        }
      } catch { /* a transcript may disappear during a scan; retry next poll */ }
    }
    for (const key of this.cache.keys()) if (!liveKeys.has(key)) this.cache.delete(key);
    this.core.retainTimelines?.(liveKeys);
    return { agents: select(views, now), source, updatedAt: now };
  }
}
module.exports = { Collector };
