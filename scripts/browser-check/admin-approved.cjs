// Admins can delete things they approved earlier (Admin → Approved), and any Ask post or answer.
const { open, APP, shot } = require('./harness.cjs');

(async () => {
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['laptop', { width: 1280, height: 900 }]]) {
    const { browser, page, backend, problems } = await open({ viewport, admin: true });
    await page.goto(`${APP}/admin`);
    await page.getByRole('tab', { name: 'Approved' }).click({ timeout: 20000 });
    await page.getByText('An approved message that turned out to be mean').waitFor();
    check(await page.getByText(/@sender1/).first().waitFor({ timeout: 5000 }).then(() => true, () => false), `${label}: shows who sent the approved message`);
    await page.screenshot({ path: shot(`admin-approved-${label}.png`), fullPage: true });
    const card = page.locator('li', { hasText: 'turned out to be mean' });
    await card.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(800);
    check(backend.state.calls.some((c) => c.name === 'POST rpc/admin_delete_approved' && c.body._kind === 'message' && c.body._id === 'c1'), `${label}: delete sent for the message`);
    check(await page.getByText('turned out to be mean').count() === 0, `${label}: gone from the list`);
    // Filter chips.
    await page.getByRole('button', { name: 'Ask question' }).click();
    check(await page.getByText('An approved reply').count() === 0 && await page.getByText('An approved Ask question').isVisible(), `${label}: filter shows only Ask questions`);

    // Ask page: admin sees Delete on someone else's question.
    await page.goto(`${APP}/ask/a0000000-0000-4000-8000-000000000001`);
    await page.getByRole('heading', { name: /quietest place/ }).waitFor({ timeout: 20000 });
    await page.locator('article').getByRole('button', { name: 'More options' }).click();
    check(await page.getByRole('menuitem', { name: 'Delete' }).isVisible(), `${label}: admin can delete others' Ask questions`);
    check(await page.getByRole('menuitem', { name: 'Report' }).isVisible(), `${label}: and still report them`);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await page.waitForTimeout(800);
    check(backend.state.calls.some((c) => c.name === 'POST rpc/ask_delete' && c.body._kind === 'post'), `${label}: Ask delete sent`);
    check(problems.length === 0, `${label}: no page errors ${problems.join(' | ')}`);
    await browser.close();
  }
  // A normal student does not get Delete on others' questions.
  const { browser, page } = await open({ viewport: { width: 390, height: 844 } });
  await page.goto(`${APP}/ask/a0000000-0000-4000-8000-000000000001`);
  await page.getByRole('heading', { name: /quietest place/ }).waitFor({ timeout: 20000 });
  await page.locator('article').getByRole('button', { name: 'More options' }).click();
  check(await page.getByRole('menuitem', { name: 'Delete' }).count() === 0, 'student: no Delete on others\' questions');
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
