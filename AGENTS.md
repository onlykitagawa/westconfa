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
- Anonymous sending goes only through the `sendMessage` server function (service role); the messages table has no insert grant for clients, and sender identity is never stored.
- Allowed sign-up emails are enforced by a database trigger on auth.users (public.is_allowed_email); keep it in sync with moderation.ts.
- Admin checks run in SECURITY DEFINER SQL functions using has_role; never trust client role state for privileged actions.
- Message retention is the single SQL function public.message_retention_days(), purged daily by a pg_cron job calling public.purge_expired().
- Password sign-in goes through the `passwordSignIn` server function, which enforces the per-account failed-attempt limit (login_attempts table, hashed email); auth errors stay neutral so they never reveal whether an account exists.
- Spam limits for signed-in senders are keyed on a salted hash of their account id (shared campus IPs), still kept only in rate_events, never on the message.
