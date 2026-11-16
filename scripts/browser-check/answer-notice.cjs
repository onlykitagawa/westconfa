// Checks that the sender sees a public answer to their message: on the Sent page (label, red mark,
// the answer in the opened message, link to the profile) and on the private status link (guests).
const { open, APP, shot } = require('./harness.cjs');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { browser, page, backend, problems } = await open({ viewport: { width: 390, height: 844 } });
  const st = backend.state;
  st.sent = [{ message_id: 'm9', state: 'seen', sent_at: new Date(Date.now() - 3600e3).toISOString(), body: 'How does it feel to be CEO?', to_username: 'zeo', to_name: 'Zeo', reply_count: 0, awaiting_you: false, new_reply: true, answer: 'Honestly? Busy but fun.', answered_at: new Date(Date.now() - 600e3).toISOString() }];
  await page.goto(`${APP}/sent`, { waitUntil: 'domcontentloaded' });
  await page.getByText('How does it feel to be CEO?').waitFor();
  await sleep(800);
  const card = await page.locator('main ul li').first().textContent();
  assert.ok(card.includes('Answered publicly') && card.includes('New reply'), card);
  console.log('  ok  Sent card shows "New reply" and "Answered publicly"');
  await page.screenshot({ path: shot('answer-1-sent.png') });
  await page.getByText('How does it feel to be CEO?').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByText('Honestly? Busy but fun.').waitFor();
  assert.ok(await dlg.getByRole('link', { name: "See it on @zeo's profile" }).count() === 1);
  console.log('  ok  the opened message shows the answer and a link to the profile');
  for (let i = 0; i < 40 && !st.calls.some((c) => c.name === 'POST rpc/mark_sent_seen'); i++) await sleep(100);
  assert.ok(st.calls.some((c) => c.name === 'POST rpc/mark_sent_seen' && c.body._message_id === 'm9'));
  console.log('  ok  opening it saves it as seen');
  await page.screenshot({ path: shot('answer-2-dialog.png') });
  await page.keyboard.press('Escape');

  // guest status link
  const tok = 'x'.repeat(40);
  await page.route(/\/rest\/v1\/rpc\/message_status/, (r) => r.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify([{ state: 'seen', sent_at: new Date(Date.now() - 3600e3).toISOString(), body: 'How does it feel to be CEO?', to_username: 'zeo', answer: 'Honestly? Busy but fun.', answered_at: new Date(Date.now() - 600e3).toISOString() }]) }));
  await page.route(/\/rest\/v1\/rpc\/message_thread/, (r) => r.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '[]' }));
  await page.goto(`${APP}/m/${tok}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Honestly? Busy but fun.').waitFor();
  assert.ok(await page.getByText('They answered on their profile').count() === 1);
  assert.ok(await page.getByRole('link', { name: "See it on @zeo's profile" }).count() === 1);
  console.log('  ok  the private status link shows the answer and the profile link');
  await page.screenshot({ path: shot('answer-3-status.png'), fullPage: true });
  assert.deepStrictEqual(problems, []);
  await browser.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
