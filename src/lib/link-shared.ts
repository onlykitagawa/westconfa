// Remembers on this device that the student has shared their link (for the home page checklist).
const SHARED_KEY = "wc_link_shared";
export function markLinkShared() {
  try {
    localStorage.setItem(SHARED_KEY, "1");
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new Event("wc-link-shared"));
}
export function linkWasShared() {
  try {
    return localStorage.getItem(SHARED_KEY) === "1";
  } catch {
    return false;
  }
}
