import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// A round profile picture, or the first letter of the name when there is none (or it can't load).
// Size and text size come from `className`, e.g. "size-12 text-lg".
export function UserAvatar({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const show = !!url && !failed && /^https:\/\//.test(url);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-coral font-extrabold text-coral-foreground", className)} aria-hidden="true">
      {show ? (
        <img src={url} alt="" className="size-full object-cover" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
