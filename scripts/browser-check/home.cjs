// The home page: "What's new" counts the same things as the red badges, each row opens the right
// place, the link card and Ask preview are there, and the empty state reads well.
const { open, APP, shot } = require('./harness.cjs');

(async () => {
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const num = (s) => Number((s.match(/\d+/) || ['0'])[0]);
  for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1280, height: 860 }]]) {
    const { browser, page, backend, problems } = await open({ viewport });
    await page.addInitScript(() => { try { localStorage.setItem('wc_cookie_ok', '1'); } catch {} });
    await page.goto(`${APP}/`);
    await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).waitFor({ timeout: 20000 });
    await page.getByText(/You have \d+ new thing/).waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot(`home-${label}.png`), fullPage: true });
    await page.screenshot({ path: shot(`home-${label}-top.png`) });
    const nav = page.getByRole('navigation', { name: label === 'phone' ? 'App' : 'Main' });
    const badges = num(await nav.getByRole('link', { name: /Inbox/ }).innerText()) + num(await nav.getByRole('link', { name: /Ask/ }).innerText());
    const summary = num(await page.getByText(/You have \d+ new thing/).innerText());
    const rows = 1 + await page.locator('section[aria-labelledby="more-new"] li').count();
    check(summary === badges && rows === badges, `${label}: summary ${summary} = rows ${rows} = menu badges ${badges}`);
    check(await page.getByRole('heading', { name: 'Get anonymous messages' }).isVisible(), `${label}: link pass`);
    check(await page.locator('section[aria-labelledby="pass-title"] svg').first().isVisible(), `${label}: QR code on the pass`);
    check(await page.getByRole('heading', { name: 'Ask the campus' }).isVisible(), `${label}: Ask preview`);
    check(await page.getByText(/Finish your profile/).isVisible(), `${label}: next step shown for an unfinished profile`);
    // Rows open the right place.
    await page.getByRole('link', { name: /Someone replied to your message/ }).first().click();
    await page.waitForURL(/\/sent/);
    await page.getByRole('dialog').waitFor({ timeout: 8000 }).then(() => check(true, `${label}: sent reply opens the conversation`), () => check(false, `${label}: sent reply opens the conversation`));
    await page.goto(`${APP}/`);
    await page.getByRole('link', { name: /New answers to your question/ }).click();
    await page.waitForURL(/\/ask\//);
    check(true, `${label}: Ask row opens the question`);
    await page.goto(`${APP}/`);
    await page.getByRole('link', { name: /New anonymous message/ }).first().click();
    await page.getByRole('dialog').waitFor({ timeout: 8000 }).then(() => check(true, `${label}: message row opens it`), () => check(false, `${label}: message row opens it`));
    check(problems.length === 0, `${label}: no page errors ${problems.join(' | ')}`);
    const unhandled = backend.state.calls.filter((c) => c.name.startsWith('UNHANDLED'));
    if (unhandled.length) console.log('unhandled:', [...new Set(unhandled.map((c) => c.name))].join(', '));
    await browser.close();
  }
  // Nothing new.
  const { browser, page, backend } = await open({ viewport: { width: 390, height: 844 } });
  const S = backend.state;
  for (const m of S.inbox) m.read_at = new Date().toISOString();
  S.threads = [];
  for (const m of S.sent || []) m.new_reply = false;
  for (const p of S.ask) p.new_answers = false;
  await page.addInitScript(() => { try { localStorage.setItem('wc_cookie_ok', '1'); } catch {} });
  await page.goto(`${APP}/`);
  await page.getByText('Nothing new right now.').first().waitFor({ timeout: 20000 }).then(() => check(true, 'empty: "Nothing new right now."'), () => check(false, 'empty: "Nothing new right now."'));
  check(await page.getByText('No new messages yet.').isVisible(), 'empty: friendly empty bubble');
  check(await page.getByRole('button', { name: 'Share my link' }).isVisible(), 'empty: Share my link button');
  await page.screenshot({ path: shot('home-empty-phone.png'), fullPage: true });
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
