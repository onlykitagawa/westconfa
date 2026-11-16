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
