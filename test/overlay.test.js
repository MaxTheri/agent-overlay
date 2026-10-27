const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { summarize, select } = require('../overlay/activity');
const { Collector } = require('../overlay/collector');
const now = Date.now(), row = { proj: '_codex', id: 'root', title: 'Build the feature', state: 'working', mtime: now };
const timeline = (events, agents = [{ id: 'main' }]) => ({ agents, events });
const tool = (id, ts, name = 'Bash', d = { kind: 'cmd', text: 'npm test' }) => ({ id, ts, name, d });
test('appended tool calls are ordered by their own timestamps, after earlier results', () => {
  const t1 = tool('one', now - 3000), t2 = tool('two', now - 1000);
  const view = summarize(timeline([
    { kind: 'tools', agent: 'main', ts: t1.ts, tools: [t1, t2] },
    { kind: 'results', agent: 'main', ts: now - 2000, items: [{ id: 'one', out: 'ok' }] },
  ]), row, now)[0];
  assert.equal(view.state, 'working'); assert.equal(view.text, 'Exécute : npm test');
  assert.equal(view.lastTs, t2.ts); assert.equal(view.id, '_codex/root/main');
});
test('only pending user requests block; slow commands and edits stay working', () => {
  for (const [name, age, state] of [['AskUserQuestion', 1000, 'blocked'], ['Edit', 20000, 'working'], ['Bash', 70000, 'working']]) {
    const t = tool(name, now - age, name, { kind: 'text', what: name === 'AskUserQuestion' ? 'question' : '', text: 'Quel choix ?' });
    const view = summarize(timeline([{ kind: 'tools', agent: 'main', ts: t.ts, tools: [t] }]), row, now)[0];
    assert.equal(view.state, state);
  }
});
test('failed command output remains available; completion and a new user turn clear pending tools', () => {
  const t = tool('test', now - 2000);
  const events = [{ kind: 'tools', agent: 'main', ts: t.ts, tools: [t] }, { kind: 'results', agent: 'main', ts: now - 1000, items: [{ id: 'test', err: true, out: 'AssertionError: total is wrong' }] }];
  let a = summarize(timeline(events), row, now)[0];
  assert.equal(a.state, 'error'); assert.match(a.detail, /AssertionError/);
  events.push({ kind: 'say', agent: 'main', ts: now - 500, text: 'Fixed the total.', end: 1 });
  assert.equal(summarize(timeline(events), row, now)[0].state, 'done');
  events.push({ kind: 'user', agent: 'user', ts: now, text: 'Next task' });
  assert.equal(summarize(timeline(events), row, now)[0].state, 'working');
});
test('recent completions remain briefly; urgent agents sort first and stale agents disappear', () => {
  const agents = [
    { id: 'done', state: 'done', lastTs: now - 1000 },
    { id: 'old', state: 'done', lastTs: now - 311000 },
    { id: 'work', state: 'working', lastTs: now },
    { id: 'question', state: 'blocked', lastTs: now - 1000 },
  ];
  assert.deepEqual(select(agents, now).map((a) => a.id), ['question', 'work', 'done']);
});
test('an open turn shows long thinking and stays visible during silent reasoning', () => {
  const started = now - 12 * 60000;
  const view = summarize(timeline([{ kind: 'say', agent: 'main', text: 'Je réfléchis à la solution.', ts: started }]),
    { ...row, turnOpen: true, turnStartedAt: started, mtime: started }, now)[0];
  assert.equal(view.state, 'thinking');
  assert.equal(view.activeTurn, true);
  assert.equal(select([view], now).length, 1);
  const core = { boardRows: () => [{ ...row, proj: '-project', turnOpen: true, turnStartedAt: started, mtime: started }],
    timeline: () => timeline([{ kind: 'say', agent: 'main', text: 'Je réfléchis.', ts: started }]) };
  assert.equal(new Collector(core).snapshot('all', now).agents[0].state, 'thinking');
  const unknown = summarize(timeline([{ kind: 'say', agent: 'main', text: 'Ancienne activité', ts: started }]),
    { ...row, turnOpen: false }, now)[0];
  assert.equal(unknown.state, 'idle');
  assert.equal(select([unknown], now).length, 0);
});
test('a later turn start supersedes a previous final answer; completion and pending questions keep their states', () => {
  const old = { kind: 'say', agent: 'main', text: 'Terminé.', ts: now - 10000, end: 1 };
  const started = now - 5000;
  const open = { ...row, turnOpen: true, turnStartedAt: started };
  assert.equal(summarize(timeline([old]), open, now)[0].state, 'working');
  const finished = { kind: 'say', agent: 'main', text: 'Nouvelle tâche terminée.', ts: now - 1000, end: 1 };
  const done = summarize(timeline([old, finished]), { ...open, turnOpen: false, state: 'turn' }, now)[0];
  assert.equal(done.state, 'done'); assert.equal(done.activeTurn, false);
  const question = tool('ask', now - 1000, 'AskUserQuestion', { kind: 'text', what: 'question', text: 'Quel choix ?' });
  assert.equal(summarize(timeline([{ kind: 'tools', agent: 'main', ts: question.ts, tools: [question] }]), open, now)[0].state, 'blocked');
});
test('Codex lifecycle events survive silent turns and large output, then close on completion or cancellation', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-turn-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'turn.jsonl'), codex = require('../codex');
  const event = type => JSON.stringify({ type: 'event_msg', timestamp: new Date(now - 12 * 60000).toISOString(), payload: { type } }) + '\n';
  fs.writeFileSync(file, event('task_started'));
  const read = () => { const st = fs.statSync(file); return codex.boardRow({ id: 'overlay-turn-test', file, size: st.size, mtime: now - 12 * 60000 }, now); };
  assert.equal(read().turnOpen, true); assert.equal(read().state, 'working');
  fs.appendFileSync(file, JSON.stringify({ type: 'response_item', payload: { output: 'x'.repeat(150000) } }) + '\n');
  assert.equal(read().turnOpen, true, 'cached open turn is retained when its start leaves the tail window');
  fs.appendFileSync(file, event('task_complete')); assert.equal(read().turnOpen, false);
  fs.appendFileSync(file, event('turn_started')); assert.equal(read().turnOpen, true);
  fs.appendFileSync(file, event('turn_aborted')); assert.equal(read().turnOpen, false);
  fs.writeFileSync(file, event('task_started'));
  const st = fs.statSync(file);
  assert.equal(codex.boardRow({ id: 'overlay-turn-test', file, size: st.size, mtime: now - 31 * 60000 }, now).turnOpen, false, 'stale unclosed turns still expire');
});
test('collector caches quiet timelines, filters sources, and updates changed sessions', () => {
  let reads = 0, modified = now;
  const core = { boardRows: () => [{ ...row, proj: '-project', mtime: modified }], timeline: () => { reads++; return timeline([{ kind: 'say', agent: 'main', text: 'Hello', ts: modified }]); } };
  const c = new Collector(core);
  assert.equal(c.snapshot('codex', now).agents.length, 0);
  assert.equal(c.snapshot('claude', now).agents.length, 1);
  c.snapshot('all', now + 1000); assert.equal(reads, 1);
  modified++; c.snapshot('all', now + 2000); assert.equal(reads, 2);
});
test('collector releases upstream histories when sessions expire or their source is deselected', () => {
  let retained;
  const core = { boardRows: () => [{ ...row, proj: '-project' }],
    timeline: () => timeline([{ kind: 'say', agent: 'main', text: 'Hello', ts: now }]),
    retainTimelines: keys => { retained = [...keys]; } };
  const collector = new Collector(core);
  collector.snapshot('all', now);
  assert.deepEqual(retained, ['-project/root']); assert.equal(collector.cache.size, 1);
  collector.snapshot('codex', now);
  assert.deepEqual(retained, []); assert.equal(collector.cache.size, 0);
  collector.snapshot('all', now);
  collector.snapshot('all', now + 11 * 60000);
  assert.deepEqual(retained, []); assert.equal(collector.cache.size, 0);
});
test('Codex raw approval requests remain visible before a completed command item arrives', () => {
  const parse = require('../codex').parser({ clip: text => text, toolLabel: (tool, ts) => ({ ...tool, ts, d: { kind: 'text', what: 'question', text: tool.input.questions[0].question } }) });
  const st = { agent: 'main', raw: [], toolName: {}, msgUsage: new Map(), cx: { items: true, n: 0, last: 0, userAt: -1 } };
  parse(st, { type: 'response_item', timestamp: new Date(now - 5000).toISOString(), payload: {
    type: 'custom_tool_call', name: 'exec', call_id: 'approval-call',
    input: "await tools.exec_command({cmd: 'launch', sandbox_permissions: 'require_escalated'});",
  } });
  assert.equal(summarize(timeline(st.raw), row, now)[0].state, 'blocked');
  parse(st, { type: 'response_item', timestamp: new Date(now - 1000).toISOString(), payload: {
    type: 'custom_tool_call_output', call_id: 'approval-call', output: 'Command completed',
  } });
  assert.equal(summarize(timeline(st.raw), row, now)[0].state, 'working');
});
test('async questions stay blocked through delivery acknowledgements and final messages until the user replies', () => {
  const parse = require('../codex').parser({ clip: text => text, toolLabel: (tool, ts) => ({ id: tool.id, name: tool.name, ts,
    d: { kind: 'text', what: 'question', text: tool.input.questions[0].question } }) });
  for (const raw of [true, false]) {
    const st = { agent: 'main', raw: [], toolName: {}, msgUsage: new Map(), cx: { items: true, n: 0, last: 0, userAt: -1 } };
    let time = now - 10000;
    const record = (type, payload) => parse(st, { type, timestamp: new Date(time += 100).toISOString(), payload });
    const item = item => record('event_msg', { type: 'item_completed', item });
    const view = () => summarize(timeline(st.raw), { ...row, state: 'working', turnOpen: true }, now)[0];
    const questions = [{ title: 'Tu vois la patte ?', options: ['Oui', 'Non'] }];
    if (raw) record('response_item', { type: 'function_call', name: 'request_user_input_async', call_id: 'ask', arguments: JSON.stringify({ questions }) });
    item({ type: 'AgentMessage', id: 'ask', phase: 'final_answer', delivery: 'async', questions, content: [{ type: 'Text', text: 'Tu vois la patte ?' }] });
    record('response_item', { type: 'function_call_output', call_id: 'ask', output: '{"accepted":true}' });
    assert.equal(st.raw.filter(e => e.kind === 'tool').length, 1);
    assert.equal(st.raw.filter(e => e.kind === 'results').length, 0);
    assert.equal(view().state, 'blocked');
    item({ type: 'AgentMessage', id: 'comment', phase: 'commentary', content: [{ type: 'text', text: 'Je te laisse regarder.' }] });
    assert.equal(view().state, 'blocked'); assert.equal(view().text, 'Tu vois la patte ?');
    item({ type: 'AgentMessage', id: 'final', phase: 'final_answer', content: [{ type: 'text', text: 'À toi.' }] });
    record('event_msg', { type: 'task_complete' });
    assert.equal(view().state, 'blocked');
    assert.equal(summarize(timeline(st.raw), { ...row, state: 'turn', turnOpen: false }, now)[0].state, 'blocked');
    item({ type: 'UserMessage', id: 'reply', content: [{ type: 'text', text: 'Oui' }] });
    assert.equal(view().state, 'working');
    assert.equal(st.raw.filter(e => e.kind === 'results').length, 1);
  }
});
test('Codex descendants are linked by parent metadata, without automatic permission reviews', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-codex-'));
  const dir = path.join(tmp, 'sessions/2026/10/12'); fs.mkdirSync(dir, { recursive: true });
  const id = (n) => '01a00000-0000-7000-8000-' + String(n).padStart(12, '0');
  const write = (n, p) => fs.writeFileSync(path.join(dir, `rollout-date-${id(n)}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: id(n), cwd: '/example', ...p } }) + '\n');
  write(1, { source: 'vscode' });
  write(2, { parent_thread_id: id(1), source: { subagent: { thread_spawn: { parent_thread_id: id(1) } } }, agent_nickname: 'Ada' });
  write(3, { parent_thread_id: id(1), source: { subagent: { other: 'guardian' } }, thread_source: 'guardian_review' });
  write(4, { source: { subagent: { thread_spawn: { parent_thread_id: id(2) } } }, agent_role: 'tester' });
  const previous = process.env.AGENT_STANDUP_CODEX; process.env.AGENT_STANDUP_CODEX = tmp;
  try { assert.deepEqual(require('../codex').children(id(1)).map((a) => a.id).sort(), [id(2), id(4)]); }
  finally { if (previous == null) delete process.env.AGENT_STANDUP_CODEX; else process.env.AGENT_STANDUP_CODEX = previous; fs.rmSync(tmp, { recursive: true, force: true }); }
});
