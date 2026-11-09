// Shared, pure rules used by both the browser (friendly early feedback) and the server (enforcement).

export const MAX_MESSAGE_LENGTH = 500;
export const LIMIT_PER_SENDER_PER_HOUR = 5;
export const LIMIT_PER_SENDER_TO_RECIPIENT_PER_HOUR = 3;
export const ALWAYS_ALLOWED_EMAILS = ["zukhrdnvoybek@gmail.com"];
export const ALLOWED_EMAIL_DOMAIN = "students.wiut.uz";

export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  if (ALWAYS_ALLOWED_EMAILS.includes(e)) return true;
  return /^[^\s@]+@students\.wiut\.uz$/.test(e);
}

export function isStaffChatEmail(email: string): boolean {
  return /^[^\s@]+@wiut\.uz$/.test(email.trim().toLowerCase());
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const RESERVED_USERNAMES = [
  "admin", "inbox", "settings", "auth", "u", "api", "privacy", "terms", "guidelines", "contact",
  "support", "help", "westconfa", "west_confa", "root", "system", "moderator", "wiut",
];
export function isValidUsername(u: string) {
  return USERNAME_RE.test(u) && !RESERVED_USERNAMES.includes(u);
}

export type RejectReason = "slur" | "threat" | "personal";

// Kept short and deliberately conservative. English, Russian and Uzbek (Latin + Cyrillic).
const SLURS = [
  "nigger", "nigga", "faggot", "fag", "retard", "tranny", "whore", "slut", "cunt",
  "пидор", "пидар", "пидр", "педик", "шлюха", "хуесос", "чурка", "даун", "сука", "блядь", "уебок", "уёбок",
  "jalab", "qanjiq", "gandon", "suka", "blyad", "pidor", "dalbayob", "dolboyob", "skotina",
  "жалаб", "қанжиқ", "ганд", "далбаёб",
];
const THREATS = [
  "kill you", "kill yourself", "kys", "i will hurt you", "i'll hurt you", "you will die", "beat you up",
  "i know where you live", "rape",
  "убью", "убить тебя", "убей себя", "зарежу", "изобью", "сдохни", "я знаю где ты живешь", "я знаю где ты живёшь",
  "o'ldiraman", "oldiraman", "seni o'ldiraman", "o'lib ket", "olib ket", "uraman seni", "o'ldir",
  "ўлдираман", "сени ўлдираман", "ўлиб кет",
];

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[0]/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/4/g, "a")
    .replace(/[@]/g, "a").replace(/\$/g, "s").replace(/[`’‘ʻʼ]/g, "'")
    .replace(/(.)\1{2,}/g, "$1$1");
}

function containsWord(text: string, word: string) {
  if (word.includes(" ")) return text.includes(word);
  const re = new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u");
  return re.test(text);
}

export function hasPersonalDetails(raw: string): boolean {
  const digits = raw.replace(/[\s\-().]/g, "");
  if (/\+?\d{9,}/.test(digits)) return true; // phone numbers
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(raw)) return true; // email addresses
  if (/(t\.me|instagram\.com|wa\.me)\//i.test(raw)) return true; // contact links
  if (/(^|\s)@[a-z0-9_]{4,}/i.test(raw)) return true; // @handles
  return false;
}

export function checkMessage(raw: string): RejectReason | null {
  const text = normalize(raw);
  if (THREATS.some((w) => containsWord(text, w))) return "threat";
  if (SLURS.some((w) => containsWord(text, w))) return "slur";
  if (hasPersonalDetails(raw)) return "personal";
  return null;
}

// Accounts & sessions
export const MIN_PASSWORD_LENGTH = 8;
export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_WINDOW_MINUTES = 15;
export const SESSION_MAX_DAYS = 30;
export const RESEND_COOLDOWN_SECONDS = 60;

export function isValidPassword(pw: string) {
  return pw.length >= MIN_PASSWORD_LENGTH && pw.length <= 72;
}
