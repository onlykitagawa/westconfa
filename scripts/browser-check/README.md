# Browser checks

Real-browser checks of the signed-in pages. They run the site locally and answer every backend
request with fake data, so no real account or real message is involved.

```
bun install --frozen-lockfile        # once
node_modules/.bin/vite dev --port 4321 --host 127.0.0.1 &
node scripts/browser-check/reply-marks.cjs
```

Needs Playwright with Chromium available to `require("playwright")` (it is not a project
dependency). Screenshots go to `OUT_DIR` (default: the system temp folder). `APP_URL` overrides the
address of the local site.

- `harness.cjs`: fake sign-in and fake backend (`open()` returns the page and the backend state).
- `reply-marks.cjs`: the red "new reply" marks on Inbox and Sent, including "open it, visit another
  page, come back" and a reply arriving while the conversation is open.
- `search-fresh.cjs`: search never shows an old username after someone renames their profile.
- `answer-notice.cjs`: the sender sees a public answer to their message (Sent page and status link).
- `ask.cjs`: the Ask feed (voting, Mine tab, question page, "new answers" mark, home preview, admin tab).
