// Search engines and visitors get the real landing page from the server (not "Loading…"), with a
// canonical address, preview image and structured data. A browser with a saved sign-in never shows
// the visitor landing page: it stays hidden until the student's home page has loaded.
const { chromium } = require('playwright');
const { open, APP } = require('./harness.cjs');

(async () => {
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

  // 1. Raw server HTML, as a crawler first receives it.
  const html = await (await fetch(`${APP}/`)).text();
  check(html.includes('Say it kindly') && !html.includes('>Loading…<'), 'server sends the landing page, not "Loading…"');
  check(html.includes('rel="canonical" href="https://westconfa.tech/"'), 'canonical address');
  check(html.includes('og:image" content="https://westconfa.tech/og.jpg'), 'preview image');
  check(html.includes('application/ld+json'), 'structured data');
  const robots = await (await fetch(`${APP}/robots.txt`)).text();
  check(robots.includes('Disallow: /inbox') && robots.includes('Sitemap: https://westconfa.tech/sitemap.xml'), 'robots.txt keeps private pages out and lists the sitemap');
  check((await fetch(`${APP}/sitemap.xml`)).ok, 'sitemap.xml served');

  // 2. A visitor without JavaScript still sees the content (what a basic crawler sees).
  const b = await chromium.launch();
  const noJs = await b.newPage({ javaScriptEnabled: false });
  await noJs.goto(`${APP}/`);
  check(await noJs.getByRole('heading', { name: /Say it kindly/ }).isVisible(), 'landing visible without JavaScript');
  await b.close();

  // 3. Signed-in browser: the landing page is never visible, then the home page appears.
  const { browser, page, problems } = await open({ viewport: { width: 390, height: 844 } });
  const seen = [];
  await page.exposeFunction('reportLanding', (v) => seen.push(v));
  await page.addInitScript(() => {
    const tick = () => {
      const h = document.querySelector('h1');
      if (h && /Say it kindly/.test(h.textContent || '')) window.reportLanding(getComputedStyle(h).visibility);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(`${APP}/`);
  await page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }).waitFor({ timeout: 20000 });
  check(seen.every((v) => v === 'hidden'), `signed in: landing never visible (${seen.length} frames, ${[...new Set(seen)].join(',') || 'none'})`);
  check(problems.length === 0, `no page errors ${problems.join(' | ')}`);
  await browser.close();

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
