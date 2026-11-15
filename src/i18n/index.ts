import { formatDistanceToNow } from "date-fns";
import { ru as ruDate, uz as uzDate } from "date-fns/locale";
import { en, type Dict } from "./en";
import { ru } from "./ru";
import { uz } from "./uz";
import * as legalEn from "./legal.en";

export type Lang = "en" | "ru" | "uz";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "uz", label: "O‘zbekcha" },
];
const DICTS: Record<Lang, Dict> = { en, ru, uz };
const KEY = "wc_lang";

// `t` is a live binding: every file reads it at render time, so switching the dictionary here
// changes the whole site. The server always renders English; the browser switches to the saved
// language before the app first renders (see __root.tsx), so pages never mix languages.
export let t: Dict = en;
export let lang: Lang = "en";
export const legal = legalEn; // Legal pages are English-only for now (see common.legalEnglishOnly).

export function storedLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ru" || v === "uz") return v;
  } catch {
    // storage blocked
  }
  return "en";
}

export function applyLang(next: Lang) {
  lang = next;
  t = DICTS[next];
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

// Saves the choice and reloads, so every screen (and the page title) is rebuilt in the new language.
export function changeLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // storage blocked: the change lasts for this page only
  }
  applyLang(next);
  window.location.reload();
}

export function timeAgo(date: string | Date) {
  const locale = lang === "ru" ? ruDate : lang === "uz" ? uzDate : null;
  return formatDistanceToNow(new Date(date), locale ? { addSuffix: true, locale } : { addSuffix: true });
}
