'use strict';
// Reduce the upstream timeline to small text bubbles. No model calls or audio.
const basename = (s) => String(s || '').split(/[\\/]/).pop();
const short = (s, n = 240) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const departure = require('../public/overlay-departure');
function action(tool) {
  const d = tool.d || {}, file = basename(d.file || tool.arg);
  switch (d.kind) {
    case 'cmd': return 'Exécute : ' + short(d.note || d.text || tool.arg, 160);
    case 'read': return 'Lit ' + file;
    case 'edit': return 'Modifie ' + file;
    case 'write': return 'Crée ' + file;
    case 'grep': return 'Cherche « ' + short(d.pattern, 100) + ' »';
    case 'glob': return 'Explore ' + short(d.pattern, 100);
    case 'web': return d.query ? 'Recherche : ' + short(d.query, 140) : 'Consulte ' + short(d.url, 140);
    case 'todo': return 'Planifie : ' + short((d.items || []).find((x) => x.s === 'in_progress')?.c || 'les prochaines étapes', 140);
    default: return d.what === 'question' ? short(d.text) : short(d.v || tool.name) + (tool.arg ? ' · ' + short(tool.arg, 100) : '');
  }
}
function summarize(timeline, row, now = Date.now()) {
  const byId = new Map((timeline.agents || []).map((a) => [a.id, {
    id: row.proj + '/' + row.id + '/' + a.id, agentId: a.id,
    name: a.name || (a.id === 'main' ? (row.proj === '_codex' ? 'Codex' : 'Claude') : a.role || 'Agent'),
    role: a.roleFr || a.role || '', session: short(row.title, 100), source: row.proj === '_codex' ? 'codex' : 'claude',
    state: 'idle', text: 'En attente', detail: '', lastTs: 0, pending: new Map(), lastTool: null, done: false,
  }]));
  // Tool beats can contain calls appended much later than their first event.
  const beats = [];
  for (const e of timeline.events || []) {
    if (e.kind === 'tools') for (const t of e.tools || []) beats.push({ ...e, kind: 'tool', tool: t, ts: t.ts || e.ts, end: e.end && t === e.tools.at(-1) });
    else beats.push(e);
  }
  beats.sort((a, b) => a.ts - b.ts);
  for (const e of beats) {
    if (e.ts > now) continue;
    if (e.kind === 'user') { const lead = byId.get('main'); if (lead) { lead.done = false; lead.pending.clear(); lead.state = 'working'; lead.text = 'Prépare la suite…'; lead.lastTs = e.ts; } continue; }
    if (e.kind === 'order') { const child = byId.get(e.to); if (child) { child.done = false; child.state = 'working'; child.text = short(e.fr || e.text); child.lastTs = e.ts; } }
    const a = byId.get(e.agent); if (!a || ['usage', 'compact'].includes(e.kind)) continue;
    a.lastTs = Math.max(a.lastTs, e.ts);
    if (e.kind === 'tool') { a.done = false; a.state = 'working'; a.lastTool = e.tool; if (e.tool.name !== 'TodoWrite') a.pending.set(e.tool.id, e.tool); a.text = action(e.tool); a.detail = short(e.tool.d?.text || e.tool.d?.file || e.tool.arg, 600); }
    if (e.kind === 'results') for (const r of e.items || []) {
      const t = a.pending.get(r.id); a.pending.delete(r.id);
      if (r.err) { a.state = 'error'; a.text = 'Échec · ' + (t ? action(t) : 'outil'); a.detail = short(r.out, 600); }
      else if (!a.pending.size && a.state !== 'done' && a.state !== 'error') { a.state = 'working'; a.text = 'Poursuit le travail…'; }
    }
    if (e.kind === 'say' || e.kind === 'report') { a.text = short(e.fr || e.text); a.detail = String(e.fr || e.text).slice(0, 1200); a.state = e.kind === 'report' || e.end ? 'done' : 'working'; }
    if (e.kind === 'finish' || e.kind === 'report' || e.end) {
      a.done = true; a.state = 'done';
      for (const [id, tool] of a.pending) if (!tool.asynchronous) a.pending.delete(id);
    }
  }
  return [...byId.values()].filter((a) => a.lastTs || (a.agentId === 'main' && row.turnOpen)).map((a) => {
    // An explicit open turn survives silent reasoning. A later start also
    // supersedes the previous final answer before any new text is logged.
    if (a.agentId === 'main' && row.turnOpen && row.turnStartedAt > a.lastTs) {
      a.done = false; a.pending.clear(); a.state = 'working'; a.text = 'Prépare la suite…'; a.lastTs = row.turnStartedAt;
    }
    const activeTurn = a.agentId === 'main' && !!row.turnOpen && !a.done;
    const tools = [...a.pending.values()];
    // A later parallel tool must not hide an unanswered request to the user.
    const pending = tools.find(t => /^(AskUserQuestion|ExitPlanMode)$/.test(t.name)) || tools.at(-1), age = now - a.lastTs;
    if (pending?.asynchronous || (!a.done && pending)) {
      a.state = /^(AskUserQuestion|ExitPlanMode)$/.test(pending.name) ? 'blocked' : 'working';
      a.text = action(pending);
    } else if (a.agentId === 'main' && row.state === 'turn') a.state = 'done';
    else if (activeTurn && age >= 120000 && a.state === 'working') { a.state = 'thinking'; a.text = 'Réfléchit depuis plus de 2 minutes…'; }
    else if (!activeTurn && !a.done && age > 180000 && a.state !== 'error') { a.state = 'idle'; a.text = 'Aucune activité récente'; }
    if (a.agentId === 'main' && row.state === 'blocked') a.state = 'blocked';
    const { pending: ignored, lastTool, done, ...view } = a;
    return { ...view, activeTurn, activityKind: pending?.d?.kind || '', ageMs: Math.max(0, age) };
  });
}
const priority = { blocked: 0, error: 1, working: 2, thinking: 3, waiting: 3, departing: 4, done: 5, idle: 6 };
function select(agents, now = Date.now()) {
  return agents.map(a => departure.select(a, now)).filter(Boolean)
    .filter((a) => a.activeTurn || a.state === 'blocked' || a.state === 'waiting' || now - a.lastTs < 600000)
    .sort((a, b) => priority[a.state] - priority[b.state] || b.lastTs - a.lastTs);
}
module.exports = { action, summarize, select };
