import { createFileRoute } from "@tanstack/react-router";
import { legal } from "@/i18n";
import { LegalPage } from "@/components/site/legal-page";

const title = "Privacy Policy · west confa";
const desc = "What west confa collects, why, how long we keep it, and your rights. No ads, no trackers, no selling data.";
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title }, { name: "description", content: desc },
      { property: "og:title", content: title }, { property: "og:description", content: desc },
      { property: "og:type", content: "article" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc={legal.privacy} />,
});
