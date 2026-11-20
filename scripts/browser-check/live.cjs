// Changes show up without reloading: a new message on the home page and badge, new votes and
// questions on Ask (without the list jumping), a new answer on a question page, and no checking
// while the tab is hidden.
const { open, APP, shot } = require('./harness.cjs');

(async () => {
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const iso = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
  const { browser, page, backend, problems } = await open({ viewport: { width: 1280, height: 900 } });
  const S = backend.state;

  await page.goto(`${APP}/`);
  await page.getByRole('heading', { name: 'Ask the campus' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  const inboxLink = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Inbox/ });
  const before = await inboxLink.innerText();
  S.inbox.unshift({ id: 'i9', body: 'Brand new message arriving live', created_at: new Date().toISOString(), read_at: null, replies_closed: false });
  await page.getByText('Brand new message arriving live').first().waitFor({ timeout: 13000 }).then(() => check(true, 'home: new message appears without reload'), () => check(false, 'home: new message appears without reload'));
  await page.waitForTimeout(500);
  check((await inboxLink.innerText()) !== before, `nav: Inbox badge changed (${before.replace(/\s+/g, ' ')} -> ${(await inboxLink.innerText()).replace(/\s+/g, ' ')})`);

  // Ask feed: counts update in place, a new question waits behind the button.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Ask/ }).click();
  await page.getByRole('heading', { name: 'Ask', level: 1 }).waitFor();
  await page.waitForTimeout(800);
  const order = async () => (await page.locator('article p.line-clamp-6').allInnerTexts()).map((x) => x.slice(0, 18));
  const first = await order();
  S.ask[1].score = 40; // electives would now rank first in Hot
  S.ask.push({ id: 'a0000000-0000-4000-8000-000000000009', body: 'Fresh question posted just now', status: 'approved', created_at: iso(0), published_at: iso(0), score: 0, voted: false, mine: false, new_answers: false });
  const pill = page.getByRole('button', { name: /1 new question/ });
  await pill.waitFor({ timeout: 13000 }).then(() => check(true, 'ask: "1 new question" button appears'), () => check(false, 'ask: "1 new question" button appears'));
  check(JSON.stringify(await order()) === JSON.stringify(first), `ask: list did not jump (${(await order()).join(' | ')})`);
  check((await page.locator('article', { hasText: 'electives' }).getByRole('button', { name: /upvote/i }).innerText()).includes('40'), 'ask: new vote count shown in place');
  await page.screenshot({ path: shot('live-ask-pill.png') });
  await pill.click();
  await page.waitForTimeout(600);
  const after = await order();
  check(after[0].startsWith('Fresh question') || after.some((x) => x.startsWith('Fresh question')), `ask: tapping shows the new question (${after.join(' | ')})`);
  check(await pill.count() === 0, 'ask: button gone after tapping');

  // Question page: a new answer appears.
  await page.getByRole('link', { name: /quietest place/ }).click();
  await page.getByRole('heading', { name: /quietest place/ }).waitFor();
  S.askAnswers.push({ id: 'b9', post_id: 'a0000000-0000-4000-8000-000000000001', body: 'Live answer from another student', status: 'approved', created_at: iso(0), published_at: iso(0), score: 0, voted: false, mine: false, by_asker: false });
  await page.getByText('Live answer from another student').waitFor({ timeout: 13000 }).then(() => check(true, 'question: new answer appears without reload'), () => check(false, 'question: new answer appears without reload'));

  // Hidden tab: no checking; visible again: checks at once.
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
  await page.waitForTimeout(300);
  const n0 = S.calls.length;
  await page.waitForTimeout(12000);
  check(S.calls.length === n0, `hidden tab: no requests in 12 s (${S.calls.length - n0})`);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
  await page.waitForTimeout(1500);
  check(S.calls.length > n0, `back to the tab: refreshed at once (${S.calls.length - n0} requests)`);

  check(problems.length === 0, `no page errors ${problems.join(' | ')}`);
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
