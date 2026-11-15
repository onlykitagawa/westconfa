<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- All user-facing text lives in src/i18n (en.ts, legal.en.ts); components read `t`/`legal` so ru/uz can be added by swapping the dictionary.
- Moderation, email allowlist and rate-limit constants live in src/lib/moderation.ts and are shared by browser and server; tests in src/test/moderation.test.ts.
- Anonymous sending goes only through the `sendMessage` server function (service role); the messages table has no insert grant for clients. Sender identity is kept only in message_senders (service-role only, no RLS policies) and is readable solely by admins via admin_message_details for held or reported messages; recipients never see it.
- Allowed sign-up emails are enforced by a database trigger on auth.users (public.is_allowed_email); keep it in sync with moderation.ts.
- Admin checks run in SECURITY DEFINER SQL functions using has_role; never trust client role state for privileged actions.
- Message retention is the single SQL function public.message_retention_days(), purged daily by a pg_cron job calling public.purge_expired().
- Password sign-in goes through the `passwordSignIn` server function, which enforces the per-account failed-attempt limit (login_attempts table, hashed email); auth errors stay neutral so they never reveal whether an account exists.
- Spam limits for signed-in senders are keyed on a salted hash of their account id (shared campus IPs), still kept only in rate_events, never on the message.

- Authentication emails use the managed SDK handler and a shared email layout, with email copy in src/i18n; include action tokens so the existing code-entry flows remain usable.
- Capture email-link credentials when creating the router, await them before child guards and hydration render auth, clear private caches when replacing accounts, and grant reset readiness only to the verified recovery user.
- Successful non-recovery email links navigate directly to inbox; recovery links navigate to password reset so link sign-in never needs an extra confirmation tap.
- Keep the inline brand glyph token-colored and mirror its geometry in the SVG favicon; retain existing raster icons as fallbacks so small-icon rendering stays consistent.
- Shared field surfaces and read-message glass use semantic CSS tokens so app screens inherit both themes without local color literals.
- AI screening runs in server-only modules; a service-role-only SQL function atomically stores screened messages, private reasons and separate rate events so pending messages never reach recipient reads.
- Recipient inbox and export queries explicitly scope to the recipient, approved status and visible rows, including for admins whose RLS read policy is wider.
- Senders get a private status link (/m/$token) after sending: only the token's SHA-256 is stored, in message_trackers (service-role only, written by attach_message_tracker after store_screened_message). public.message_status(token) returns only the state (waiting/delivered/seen/not_delivered), send time and the sender's own text; a BEFORE DELETE trigger on messages keeps the final state, and trackers are purged with messages after message_retention_days().
- Profile search goes only through public.search_profiles(query) (signed-in users, at least 2 characters, max 8 results, 120 searches/hour via search_events which stores no query text). profiles.searchable defaults to true (opt-out in Settings). Clients may update only username, display_name, inbox_paused, avatar_url, bio and searchable on their own profile (column-level grant); suspended, email and roles change only through admin SECURITY DEFINER functions.
- Replies and public answers go only through the server functions in src/lib/replies.functions.ts (service role). The recipient's reply opens a private thread (message_replies); the sender answers through their status link (add_sender_reply matches the token's SHA-256) only after the recipient replied and only when the last approved reply is the recipient's. Both are screened like messages; sender replies obey review_all_messages. Clients cannot insert, update or delete replies; the recipient reads their own thread by RLS, the sender through message_thread(token). Public Q&A (public_answers) copies the question text with no link to the message or sender; it is read through get_public_answers(username), owners may delete their own, signed-in visitors can report (hidden after 2 reporters) and admins decide in the "Replies & Q&A" tab via admin_review_queue / admin_decide_reply / admin_decide_answer.
- Profile photos go only through the server functions in src/lib/avatar.functions.ts (service role). The browser crops to 512 px JPEG; the server re-parses the JPEG, drops EXIF/XMP/comments, limits size, applies 5 uploads per hour (avatar_events, 24 h), and requires an explicit "allow" from the AI vision check (any failure or outage refuses the photo). Files are stored in the public `avatars` bucket under a random name; clients cannot write profiles.avatar_url or the bucket. A replaced, removed, reported or deleted-account photo has its file deleted (src/lib/avatar-storage.server.ts). Two distinct reporters hide a photo (report_avatar); admins remove one via admin_clear_avatar in the Accounts tab.
