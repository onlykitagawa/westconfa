import { Link } from "@tanstack/react-router";
import { t } from "@/i18n";

// Switches between the messages you received (Inbox) and the ones you sent (Sent).
export function MessageTabs() {
  const tab = "press rounded-full px-5 py-2 text-sm font-semibold text-muted-foreground";
  const active = { className: "bg-brand text-brand-foreground" };
  return (
    <nav aria-label="Messages" className="glass mb-5 flex w-fit gap-1 rounded-full p-1">
      <Link to="/inbox" className={tab} activeProps={active}>{t.common.inbox}</Link>
      <Link to="/sent" className={tab} activeProps={active}>{t.common.sent}</Link>
    </nav>
  );
}
