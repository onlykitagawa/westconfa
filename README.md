# westconfa

Build "west confa" — a real, production-quality, mobile-first website exclusively for students of WIUT (Westminster International University in Tashkent). Phase 1 is ANONYMOUS MESSAGES. It must feel like a polished modern product (think Linear or Apple), not a template. Build Phase 1 only. Don't ask me questions: make sensible decisions and list your assumptions at the end.

## 1. Concept
Every verified student gets a personal link (/u/:username). Anyone who opens it can send that student an anonymous message, with no account needed for the sender. The student reads messages in a private inbox. Expect about 3000 users, so keep it simple and fast.

## 2. Pages
Public:
- Landing (/): airy and minimal. Hero (short headline, one sentence, one main button "Get my link", small "Sign in"), then "How it works" in 3 short steps, then a "Safe by design" row of 3 short points, then a collapsed FAQ with 4 questions, then the footer. Nothing else. Lots of whitespace, one idea per section.
- /u/:username: a friendly card with the student's display name, a large textarea (max 500 characters, live counter), a "Send anonymously" button, and a success state with a gentle animation and a "Get your own link" button. Show a short note: "Your identity is never stored or shown. Be kind."
- /privacy, /terms, /guidelines (Community Guidelines plus Help & Safety), /contact (a form saved to the database and visible in admin, no public email), and a 404 page.

Signed-in:
- /auth: email one-time code sign-in (no passwords). Accept only emails ending in @[wiut.uz], plus [zukhrdnvoybek@gmail.com], which is always allowed. Enforce this on the backend, not only in the UI. Show a friendly error otherwise. Sign-up requires a checkbox agreeing to Terms and Privacy Policy.
- Onboarding: pick a unique username (a-z, 0-9, underscore) and an optional display name.
- /inbox: messages newest first, unread dot, tap to open. Actions: mark read, delete, report. A "Share my link" button with copy, QR code, and the native share sheet on phones. Friendly empty state.
- /settings: pause or resume inbox, change username, sign out, download my data, delete account (permanently deletes the account and all messages, with confirmation).
- /admin (admins only): reported-messages queue, delete a message, suspend a user, read contact-form messages, basic stats (users, messages per day). [MY EMAIL] is the first admin.

## 3. Privacy and safety (non-negotiable)
- Never store sender identity with a message. For spam control only, store a salted hash of the sender's IP that auto-deletes after 24 hours. Limits: 5 messages per hour per sender, 3 per hour to the same recipient. Add a honeypot field. Enforce limits server-side in edge functions.
- Basic blocklist for slurs, threats, and phone numbers or personal details in English, Russian, and Uzbek. Rejected messages get a friendly explanation.
- A message reported several times is auto-hidden until an admin reviews it.
- Row Level Security on every table. Recipients can read only their own messages. Roles live in a separate user_roles table and admin checks happen server-side. No secrets in client code.
- Data minimization: store only email, username, display name, and messages. Messages auto-delete after 90 days (a single configurable constant).
- Write full, real, plain-English legal pages (no lorem ipsum):
  - Privacy Policy: what we collect, why, retention, deletion rights, no selling of data, no ads, no third-party trackers, security, how to contact us.
  - Terms of Service: eligibility (current WIUT students), prohibited content, harassment and bullying, suspension and termination, liability, changes.
  - Community Guidelines and Help & Safety: what is not allowed, how to report, and a placeholder section for university and mental-health support contacts.
  - Show "Last updated: November 2026" on each.
- Cookies: essential only. A small one-line notice, no analytics or tracking.
- A footer on every page with links to all legal pages and: "Independent student project. Not affiliated with or endorsed by WIUT."

## 4. Design
- Mobile-first, flawless from 360px phones to 1440px laptops. Buttons at least 48px tall. Bottom navigation on mobile (Inbox, Share, Settings), top navigation on desktop.
- Style: calm, modern, premium. Soft gradient background (deep indigo to violet with a warm coral accent), frosted-glass cards, 20-24px rounded corners, subtle shadows, generous spacing, big confident headings. Font: Plus Jakarta Sans or Inter.
- Light and dark mode (follow the system, with a toggle). Use design tokens, no hard-coded colors.
- Smooth motion: soft fade/slide-ins, button press feedback, skeleton loaders, optimistic UI. Respect prefers-reduced-motion.
- Friendly student-to-student tone. English for now, but keep all text in a translation file so Russian and Uzbek can be added later.
- WCAG AA contrast, full keyboard navigation, visible focus states.
- Fast loading, SEO meta tags, Open Graph image, favicon, installable PWA manifest (add to home screen).

## 5. Tech
React, Tailwind, shadcn/ui. Lovable Cloud (Supabase) for auth, database, and edge functions.

## 6. Phase 2: DO NOT BUILD YET
Social network (profile pictures, bios, optional blog posts). Only prepare for it: the profiles table should already include username, display_name, avatar_url, and bio.

When done, list your assumptions and exactly what I still need to configure.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://westconfa.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ee76c8ef-ca1b-5da9-bc4a-d1e4c5286134).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
