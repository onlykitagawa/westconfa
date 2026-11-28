// The public address of the site and the tags search engines and link previews read.
export const SITE_URL = "https://westconfa.tech";
export const OG_IMAGE = `${SITE_URL}/og.jpg`;

// Title, description, the page's one official address (canonical) and the preview card.
export function pageSeo(path: string, title: string, description: string, type: "website" | "article" | "profile" = "website") {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
