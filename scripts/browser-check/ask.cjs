// Ask feed: the list, voting, the question page (answers, "Asker" label, own waiting answer),
// clearing the "new answers" mark, the Mine tab, the home preview and the nav on phone and laptop.
const { open, APP, shot } = require('./harness.cjs');

(async () => {
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const settle = (page) => page.waitForTimeout(900);

  for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1280, height: 860 }]]) {
    const { browser, page, backend, problems } = await open({ viewport });
    await page.goto(`${APP}/`);
    await page.getByRole('heading', { name: 'Ask the campus' }).waitFor({ timeout: 20000 });
    await settle(page);
    await page.screenshot({ path: shot(`ask-home-${label}.png`), fullPage: true });
    check(await page.getByText('Where is the quietest place to study').first().isVisible(), `${label}: home shows the top question`);
    const nav = label === 'phone' ? page.getByRole('navigation', { name: 'App' }) : page.getByRole('navigation', { name: 'Main' });
    const askLink = nav.getByRole('link', { name: /Ask/ });
    check(/1/.test(await askLink.innerText()), `${label}: Ask in the nav shows 1 new-answer mark`);
    await askLink.click();
    await page.getByRole('heading', { name: 'Ask', level: 1 }).waitFor();
    await settle(page);
    await page.screenshot({ path: shot(`ask-feed-${label}.png`), fullPage: true });
    check(await page.getByText('No answers yet').count() === 0, `${label}: answer counts shown`);
    check(await page.getByText('Is anyone selling a used Econometrics').count() === 0, `${label}: my waiting question is not in the public feed`);

    // Vote on someone else's question; my own question's vote button is disabled.
    const other = page.locator('article', { hasText: 'quietest place' });
    await other.getByRole('button', { name: /Upvote/ }).click();
    await page.waitForTimeout(400);
    check(backend.state.calls.some((c) => c.name === 'POST rpc/ask_vote' && c.body._on === true), `${label}: upvote sent`);
    check((await other.getByRole('button', { name: /upvote/i }).innerText()).includes('15'), `${label}: count went up to 15`);
    check(await page.locator('article', { hasText: 'electives' }).getByRole('button', { name: /upvote/i }).isDisabled(), `${label}: can't vote on own question`);

    // Mine tab shows the waiting one.
    await page.getByRole('tab', { name: /Mine/ }).click();
    await settle(page);
    check(await page.getByText('Waiting for review').first().isVisible(), `${label}: Mine shows "Waiting for review"`);
    await page.screenshot({ path: shot(`ask-mine-${label}.png`), fullPage: true });

    // Open my question with a new answer: the mark clears.
    await page.getByRole('link', { name: /electives/ }).click();
    await page.getByRole('heading', { name: /electives/ }).waitFor();
    await settle(page);
    check(backend.state.calls.some((c) => c.name === 'POST rpc/ask_mark_seen'), `${label}: opening my question clears its mark`);
    await page.waitForTimeout(600);
    check(!/1/.test(await askLink.innerText().catch(() => '')), `${label}: nav mark gone`);

    // Someone else's question page.
    await page.goto(`${APP}/ask/a0000000-0000-4000-8000-000000000001`);
    await page.getByRole('heading', { name: /quietest place/ }).waitFor({ timeout: 20000 });
    await settle(page);
    await page.screenshot({ path: shot(`ask-question-${label}.png`), fullPage: true });
    check(await page.getByText('Asker', { exact: true }).isVisible(), `${label}: answer by the asker is labeled`);
    check(await page.getByText('Waiting for review').isVisible(), `${label}: my own waiting answer is shown to me`);
    check(await page.getByRole('textbox', { name: 'Your answer' }).isVisible(), `${label}: answer box present`);
    check(problems.length === 0, `${label}: no page errors ${problems.join(' | ')}`);
    const unhandled = backend.state.calls.filter((c) => c.name.startsWith('UNHANDLED'));
    if (unhandled.length) console.log('unhandled:', [...new Set(unhandled.map((c) => c.name))].join(', '));
    await browser.close();
  }

  // Admin tab.
  const { browser, page, problems } = await open({ viewport: { width: 1280, height: 900 }, admin: true });
  await page.goto(`${APP}/admin`);
  await page.getByRole('tab', { name: /Ask/ }).click({ timeout: 20000 });
  await settle(page);
  await page.screenshot({ path: shot('ask-admin.png'), fullPage: true });
  check(await page.getByText('AI: unsure').isVisible(), 'admin: AI opinion shown');
  check(await page.getByRole('switch', { name: /Review every post on Ask/ }).isChecked(), 'admin: review-all switch is on');
  check(problems.length === 0, `admin: no page errors ${problems.join(' | ')}`);
  await browser.close();

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
