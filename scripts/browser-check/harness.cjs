// Real-browser check of the signed-in pages against a fake backend (no real data, no sign-in).
// Every request to the backend is answered here, so the checks can see exactly what a page sends.
// See README.md in this folder for how to run it.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '../../.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SUPA = env.VITE_SUPABASE_URL.replace(/\/+$/, '');
const REF = new URL(SUPA).hostname.split('.')[0];
const APP = process.env.APP_URL || 'http://127.0.0.1:4321';
const OUT = process.env.OUT_DIR || require('os').tmpdir();
const shot = (name) => path.join(OUT, name);
const UID = '21008acf-0000-4000-8000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'test@students.wiut.uz', app_metadata: {}, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' };
const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp: now + 3600, email: user.email })}.sig`, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh', user };
const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();

function makeBackend({ admin = false } = {}) {
  const state = {
    profile: { id: UID, email: user.email, username: 'zeo0', display_name: 'Zeo Test', inbox_paused: false, searchable: true, suspended: false, bio: null, avatar_url: null },
    sent: [
      { message_id: 'm1', state: 'seen', sent_at: iso(600), body: 'First message I sent', to_username: 'zeo', to_name: 'Zeo', reply_count: 1, awaiting_you: true, new_reply: true },
      { message_id: 'm2', state: 'seen', sent_at: iso(900), body: 'Second message I sent', to_username: 'zeo', to_name: 'Zeo', reply_count: 1, awaiting_you: true, new_reply: true },
      { message_id: 'm3', state: 'delivered', sent_at: iso(1200), body: 'No reply yet on this one', to_username: 'zeo', to_name: 'Zeo', reply_count: 0, awaiting_you: false, new_reply: false },
    ],
    inbox: [
      { id: 'i2', body: 'An unread message', created_at: iso(30), read_at: null, replies_closed: false },
      { id: 'i1', body: 'A message I already answered', created_at: iso(300), read_at: iso(290), replies_closed: false },
    ],
    threads: [{ message_id: 'i1', replied: true, new_reply: true }],
    // Ask feed: q1 is someone else's, q2 is mine with a new answer, q3 is mine and waiting for review.
    ask: [
      { id: 'a0000000-0000-4000-8000-000000000001', body: 'Where is the quietest place to study on campus during exams?', status: 'approved', created_at: iso(300), published_at: iso(290), score: 14, voted: false, mine: false, new_answers: false },
      { id: 'a0000000-0000-4000-8000-000000000002', body: 'Which electives are actually worth it in second year?', status: 'approved', created_at: iso(900), published_at: iso(880), score: 6, voted: false, mine: true, new_answers: true },
      { id: 'a0000000-0000-4000-8000-000000000003', body: 'Is anyone selling a used Econometrics textbook?', status: 'pending', created_at: iso(20), published_at: null, score: 0, voted: false, mine: true, new_answers: false },
    ],
    askAnswers: [
      { id: 'b1', post_id: 'a0000000-0000-4000-8000-000000000001', body: 'Library 3rd floor, the silent zone. Get there before 10.', status: 'approved', created_at: iso(250), published_at: iso(240), score: 9, voted: true, mine: false, by_asker: false },
      { id: 'b2', post_id: 'a0000000-0000-4000-8000-000000000001', body: 'Thanks! Is it open on weekends?', status: 'approved', created_at: iso(200), published_at: iso(190), score: 1, voted: false, mine: false, by_asker: true },
      { id: 'b3', post_id: 'a0000000-0000-4000-8000-000000000001', body: 'Yes, until 6pm on Saturdays.', status: 'pending', created_at: iso(5), published_at: null, score: 0, voted: false, mine: true, by_asker: false },
      { id: 'b4', post_id: 'a0000000-0000-4000-8000-000000000002', body: 'Business Ethics, easy and actually interesting.', status: 'approved', created_at: iso(60), published_at: iso(50), score: 3, voted: false, mine: false, by_asker: false },
    ],
    askReviewAll: true,
    calls: [],
  };
  const thread = (owner, other) => [
    { id: 'r1', author: owner, body: 'Thanks for writing!', created_at: iso(200), status: 'approved', closed: false, can_reply: true },
    ...(other ? [{ id: 'r2', author: other, body: 'You are welcome', created_at: iso(100), status: 'approved', closed: false, can_reply: true }] : []),
  ];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': '*' };
  const json = (route, body, status = 200) => new Promise((r) => setTimeout(r, 90)).then(() => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    const name = `${req.method()} ${path.replace('/rest/v1/', '').replace('/auth/v1/', 'auth/')}`;
    state.calls.push({ name, body, q: url.search });
    if (path === '/auth/v1/user') return json(route, user);
    if (path === '/auth/v1/token') return json(route, session);
    if (path === '/auth/v1/logout') return json(route, {});
    if (path === '/rest/v1/profiles') return json(route, (req.headers()['accept'] || '').includes('vnd.pgrst.object') ? state.profile : [state.profile]);
    if (path === '/rest/v1/user_roles') return json(route, admin ? [{ role: 'admin' }] : []);
    if (path === '/rest/v1/messages' && req.method() === 'GET') return json(route, state.inbox);
    if (path === '/rest/v1/messages' && req.method() === 'PATCH') {
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      for (const m of state.inbox) if (!id || m.id === id) m.read_at = m.read_at || new Date().toISOString();
      return route.fulfill({ status: 204, headers: cors });
    }
    if (path === '/rest/v1/message_replies') return json(route, thread('owner', 'sender'));
    if (path === '/rest/v1/rpc/my_sent_messages') return json(route, state.sent);
    if (path === '/rest/v1/rpc/my_inbox_threads') return json(route, state.threads);
    if (path === '/rest/v1/rpc/my_sent_thread') return json(route, thread('owner', null));
    if (path === '/rest/v1/rpc/mark_sent_seen') { for (const m of state.sent) if (m.message_id === body._message_id) m.new_reply = false; return json(route, null); }
    if (path === '/rest/v1/rpc/mark_thread_seen') { for (const t of state.threads) if (t.message_id === body._message_id) t.new_reply = false; return json(route, null); }
    const askCount = (id) => state.askAnswers.filter((a) => a.post_id === id && a.status === 'approved').length;
    const live = state.ask.filter((p) => p.status === 'approved');
    if (path === '/rest/v1/rpc/ask_feed') {
      const list = [...live].sort((a, b) => (body._sort === 'new' ? b.published_at.localeCompare(a.published_at) : b.score - a.score));
      return json(route, list.slice(body._offset || 0, (body._offset || 0) + (body._limit || 30)).map((p) => ({ id: p.id, body: p.body, published_at: p.published_at, score: p.score, answer_count: askCount(p.id), voted: p.voted, mine: p.mine, new_answers: p.new_answers })));
    }
    if (path === '/rest/v1/rpc/ask_mine') return json(route, state.ask.filter((p) => p.mine).map((p) => ({ id: p.id, body: p.body, status: p.status, created_at: p.created_at, published_at: p.published_at, score: p.score, answer_count: askCount(p.id), new_answers: p.new_answers })));
    if (path === '/rest/v1/rpc/ask_post') return json(route, state.ask.filter((p) => p.id === body._id && (p.status === 'approved' || p.mine)).map(({ new_answers, ...p }) => p));
    if (path === '/rest/v1/rpc/ask_answers_of') return json(route, state.askAnswers.filter((a) => a.post_id === body._post_id).map(({ post_id, ...a }) => a));
    if (path === '/rest/v1/rpc/ask_vote') {
      const item = (body._kind === 'post' ? state.ask : state.askAnswers).find((x) => x.id === body._id);
      if (item && item.voted !== body._on) { item.voted = body._on; item.score += body._on ? 1 : -1; }
      return json(route, item ? item.score : 0);
    }
    if (path === '/rest/v1/rpc/ask_mark_seen') { for (const p of state.ask) if (p.id === body._post_id) p.new_answers = false; return json(route, null); }
    if (path === '/rest/v1/rpc/ask_report' || path === '/rest/v1/rpc/ask_delete') return json(route, null);
    if (path === '/rest/v1/rpc/admin_ask_queue') return json(route, [
      { kind: 'post', id: 'a0000000-0000-4000-8000-000000000003', body: 'Is anyone selling a used Econometrics textbook?', post_body: null, status: 'pending', hidden: false, reports: 0, ai_says: 'allow', reason: '', author_username: 'zeo0', author_email: user.email, created_at: iso(20) },
      { kind: 'answer', id: 'b3', body: 'Yes, until 6pm on Saturdays.', post_body: 'Where is the quietest place to study on campus during exams?', status: 'pending', hidden: false, reports: 0, ai_says: 'review', reason: 'Unclear meaning.', author_username: 'zeo0', author_email: user.email, created_at: iso(5) },
    ]);
    if (path === '/rest/v1/rpc/admin_ask_decide') return json(route, null);
    if (path === '/rest/v1/app_settings') return json(route, (req.headers()['accept'] || '').includes('vnd.pgrst.object') ? { value: state.askReviewAll } : [{ key: 'ask_review_all', value: state.askReviewAll }]);
    if (path === '/rest/v1/rpc/admin_stats') return json(route, { users: 120, active_links: 80, messages: 400, open_reports: 0, pending_review: 0, per_day: [] });
    state.calls.push({ name: `UNHANDLED ${name}` });
    return json(route, []);
  }
  return { state, handle };
}

async function open({ viewport, admin = false, lang = null } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  const backend = makeBackend({ admin });
  const problems = [];
  await context.addInitScript(([key, value, lang]) => {
    try {
      localStorage.setItem(key, value);
      localStorage.setItem('wc_signed_in_at', String(Date.now()));
      localStorage.setItem('wc_install_hint_closed', '1');
      if (lang) localStorage.setItem('wc_lang', lang);
    } catch {}
  }, [`sb-${REF}-auth-token`, JSON.stringify(session), lang]);
  await context.route((u) => u.href.startsWith(SUPA), backend.handle);
  await context.route((u) => !u.href.startsWith(SUPA) && !u.href.startsWith(APP) && !u.href.startsWith('data:') && !u.href.startsWith('blob:'), (route) => route.abort());
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_FAILED|ERR_BLOCKED/.test(m.text())) problems.push(`console: ${m.text().slice(0, 300)}`); });
  return { browser, context, page, backend, problems };
}

module.exports = { open, APP, SUPA, shot };
