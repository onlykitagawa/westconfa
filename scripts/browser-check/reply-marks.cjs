// Checks the red "new reply" marks end to end: they clear when a conversation is opened, the save
// is really sent, and they stay cleared on other pages and after a reload.
const { open, APP, shot } = require('./harness.cjs');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, msg, ms = 8000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(100); }
  throw new Error(`timeout: ${msg} (last: ${JSON.stringify(last)})`);
}
const num = (s) => { const m = /(\d+)/.exec(s || ''); return m ? Number(m[1]) : 0; };

(async () => {
  const { browser, page, backend, problems } = await open();
  const st = backend.state;
  const calls = () => st.calls.map((c) => c.name);
  const badge = async (sel) => num(await page.locator(sel).first().textContent());
  const headerInbox = 'nav[aria-label="Main"] a[href="/inbox"]';
  const tabInbox = 'nav[aria-label="Messages"] a[href="/inbox"]';
  const tabSent = 'nav[aria-label="Messages"] a[href="/sent"]';
  const ok = (name) => console.log('  ok  ' + name);

  console.log('A. Inbox page');
  await page.goto(`${APP}/inbox`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await until(async () => (await badge(headerInbox)) === 4, 'header badge 4');
  ok('header Inbox badge counts inbox + sent = 4');
  assert.strictEqual(await page.locator('nav[aria-label="Main"] a[href="/sent"]').count(), 0); ok('no Sent link in the header');
  assert.strictEqual(await badge(tabInbox), 2); assert.strictEqual(await badge(tabSent), 2); ok('tabs: Inbox 2, Sent 2');
  const activeTabColor = await page.locator(tabInbox).evaluate((a) => getComputedStyle(a).color);
  console.log('     active tab label color:', activeTabColor);
  await page.screenshot({ path: shot('flow-1-inbox.png') });

  const before = st.calls.length;
  await page.getByText('A message I already answered').click();
  await until(() => calls().slice(before).includes('POST rpc/mark_thread_seen'), 'mark_thread_seen sent');
  const seq = calls().slice(before).filter((n) => /message_replies|mark_thread_seen/.test(n));
  assert.ok(seq.lastIndexOf('GET message_replies') < seq.indexOf('POST rpc/mark_thread_seen') || seq.indexOf('GET message_replies') < seq.indexOf('POST rpc/mark_thread_seen'), 'conversation loaded before saving: ' + seq.join(','));
  assert.deepStrictEqual(st.calls.find((c) => c.name === 'POST rpc/mark_thread_seen').body, { _message_id: 'i1' });
  ok('opening the conversation loads it, then really sends the "seen" save: ' + seq.join(' -> '));
  await until(async () => (await badge(tabInbox)) === 1 && (await badge(headerInbox)) === 3, 'badges after inbox open');
  ok('Inbox tab badge 1 (the unread one), header 3');
  await until(async () => (await page.getByRole('dialog').getByText('You are welcome').count()) > 0, 'thread visible in dialog');
  ok('the conversation is visible in the dialog');
  await page.screenshot({ path: shot('flow-2-inbox-dialog.png') });
  await page.keyboard.press('Escape');
  await until(async () => (await page.getByRole('dialog').count()) === 0, 'dialog closed');
  assert.strictEqual(await page.getByText('New reply').count(), 0); ok('"New reply" label is gone from the inbox card');

  console.log('B. Sent page');
  await page.locator(tabSent).click();
  await until(() => page.url().endsWith('/sent'), 'on /sent');
  await until(async () => (await page.getByText('New reply').count()) === 2, 'two New reply labels');
  ok('two sent messages are marked "New reply"');
  assert.strictEqual(await page.locator(headerInbox).getAttribute('aria-current'), 'page'); ok('header "Inbox" stays highlighted on the Sent page');
  await page.screenshot({ path: shot('flow-3-sent.png') });
  const b2 = st.calls.length;
  await page.getByText('First message I sent').click();
  await until(() => calls().slice(b2).includes('POST rpc/mark_sent_seen'), 'mark_sent_seen sent');
  const seq2 = calls().slice(b2).filter((n) => /my_sent_thread|mark_sent_seen/.test(n));
  assert.ok(seq2.indexOf('POST rpc/my_sent_thread') < seq2.indexOf('POST rpc/mark_sent_seen'), seq2.join(','));
  ok('opening it loads the conversation, then sends the save: ' + seq2.join(' -> '));
  await until(async () => (await badge(tabSent)) === 1 && (await badge(headerInbox)) === 2, 'badges after sent open');
  ok('Sent tab badge 1, header 2');
  await until(async () => (await page.getByRole('dialog').getByText('Thanks for writing!').count()) > 0, 'reply visible');
  await page.screenshot({ path: shot('flow-4-sent-dialog.png') });
  await page.keyboard.press('Escape');
  await until(async () => (await page.getByRole('dialog').count()) === 0, 'dialog closed');

  console.log('C. Visit another page and come back (the bug you reported)');
  await page.locator('nav[aria-label="Main"] a[href="/search"]').click();
  await until(() => page.url().endsWith('/search'), 'on /search');
  await sleep(1200);
  assert.strictEqual(await badge(headerInbox), 2); ok('on Search: header badge still 2');
  await page.locator(headerInbox).click();
  await until(() => page.url().endsWith('/inbox'), 'on /inbox');
  await sleep(1200);
  assert.strictEqual(await badge(tabSent), 1); assert.strictEqual(await badge(tabInbox), 1); ok('back on Inbox: Sent 1, Inbox 1 (marks did not come back)');
  await page.locator(tabSent).click();
  await until(async () => (await page.getByText('New reply').count()) === 1, 'one New reply left');
  ok('Sent page: only the unopened message is still red');

  console.log('D. Full reload');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1');
  await until(async () => (await badge(tabSent)) === 1 && (await badge(headerInbox)) === 2, 'after reload');
  ok('after a reload: Sent 1, header 2');

  console.log('E. Open the second one');
  const b3 = st.calls.length;
  await page.getByText('Second message I sent').click();
  await until(() => calls().slice(b3).includes('POST rpc/mark_sent_seen'), 'mark for m2');
  await until(async () => (await badge(tabSent)) === 0 && (await badge(headerInbox)) === 1, 'all sent marks cleared');
  ok('no red mark left on Sent, header shows 1 (the unread inbox message)');

  console.log('F. A new reply arrives while the conversation is open');
  const b4 = st.calls.length;
  st.sent.find((m) => m.message_id === 'm2').new_reply = true;
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await until(() => calls().slice(b4).includes('POST rpc/mark_sent_seen'), 'second mark for m2', 12000);
  const seq4 = calls().slice(b4).filter((n) => /my_sent_thread|mark_sent_seen/.test(n));
  assert.ok(seq4.indexOf('POST rpc/my_sent_thread') > -1 && seq4.indexOf('POST rpc/my_sent_thread') < seq4.indexOf('POST rpc/mark_sent_seen'), seq4.join(','));
  ok('it reloads the conversation and clears the new mark without closing: ' + seq4.join(' -> '));
  await until(async () => (await badge(tabSent)) === 0, 'cleared again');
  await sleep(1500);
  const marksM2 = st.calls.filter((c) => c.name === 'POST rpc/mark_sent_seen' && c.body && c.body._message_id === 'm2').length;
  assert.strictEqual(marksM2, 2); ok('no request loop (exactly 2 saves for that message)');

  const unhandled = calls().filter((n) => n.startsWith('UNHANDLED'));
  assert.deepStrictEqual(unhandled, []); ok('no unexpected backend requests');
  assert.deepStrictEqual(problems, []); ok('no errors in the browser console');
  await browser.close();

  console.log('G. Phone');
  const m = await open({ viewport: { width: 390, height: 844 } });
  await m.page.goto(`${APP}/sent`, { waitUntil: 'domcontentloaded' });
  await m.page.waitForSelector('nav[aria-label="App"]');
  await sleep(1200);
  const items = await m.page.evaluate(() => [...document.querySelectorAll('nav[aria-label="App"] a, nav[aria-label="App"] button')].map((a) => ({ t: a.textContent.replace(/\d+\s*new/, '').trim(), color: getComputedStyle(a).color, current: a.getAttribute('aria-current') })));
  console.log('     bottom bar:', JSON.stringify(items));
  assert.deepStrictEqual(items.map((i) => i.t), ['Inbox', 'Search', 'Share', 'Profile']); ok('bottom bar: Inbox, Search, Share, Profile (no Sent)');
  assert.strictEqual(items[0].current, 'page'); ok('Inbox is highlighted on the Sent page');
  const tabColors = await m.page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Messages"] a')].map((a) => ({ t: a.textContent.trim().slice(0, 6), color: getComputedStyle(a).color, status: a.getAttribute('data-status') })));
  console.log('     tabs:', JSON.stringify(tabColors));
  await m.page.screenshot({ path: shot('flow-5-phone-sent.png') });
  await m.page.goto(`${APP}/search`, { waitUntil: 'domcontentloaded' });
  await m.page.waitForSelector('nav[aria-label="App"]');
  await sleep(800);
  const searchItem = await m.page.evaluate(() => { const a = document.querySelector('nav[aria-label="App"] a[href="/search"]'); return { color: getComputedStyle(a).color, status: a.getAttribute('data-status') }; });
  console.log('     active Search item:', JSON.stringify(searchItem));
  await m.page.screenshot({ path: shot('flow-6-phone-search.png') });
  assert.deepStrictEqual(m.problems, []); ok('no errors on the phone layout');
  await m.browser.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
