// Checks that search never shows an old username: rename a profile in the fake backend, leave the
// page, come back and search the same text again.
const { open, APP } = require('./harness.cjs');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { browser, page, problems } = await open();
  let people = [{ username: 'zeo0', display_name: 'no name', accepting: true, avatar_url: null }];
  let searches = 0;
  await page.route(/\/rest\/v1\/rpc\/search_profiles/, (route) => {
    searches++;
    return route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(people) });
  });
  // Navigate inside the app only (page.goto would reload and wipe the cache we want to test).
  await page.goto(`${APP}/inbox`, { waitUntil: 'domcontentloaded' });
  await page.locator('nav[aria-label="Main"] a[href="/search"]:visible').waitFor();
  const search = async (text) => {
    await page.locator('nav[aria-label="Main"] a[href="/search"]:visible').click();
    const box = page.getByRole('searchbox');
    await box.waitFor();
    await box.fill(text);
    await sleep(1500);
    return page.locator('main ul li').allTextContents();
  };
  const first = await search('no');
  assert.ok(first.join(' ').includes('@zeo0'), 'first search shows zeo0: ' + first);
  console.log('  ok  first search:', first.join(' | '));
  people = [{ username: 'zukhrdnv', display_name: 'no name', accepting: true, avatar_url: null }];
  await page.locator('nav[aria-label="Main"] a[href="/inbox"]').click();
  await sleep(800);
  // come back through the app (no reload), like a student would
  await page.locator('nav[aria-label="Main"] a[href="/search"]:visible').click();
  const box = page.getByRole('searchbox');
  await box.waitFor();
  await box.fill('no');
  await sleep(1500);
  const second = await page.locator('main ul li').allTextContents();
  console.log('  ..  after the rename:', second.join(' | '), `(searches sent: ${searches})`);
  assert.ok(second.join(' ').includes('@zukhrdnv') && !second.join(' ').includes('@zeo0'), 'shows the new username only');
  console.log('  ok  shows the new username, not the old one');
  assert.deepStrictEqual(problems, []);
  await browser.close();
  console.log('ALL PASSED');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
