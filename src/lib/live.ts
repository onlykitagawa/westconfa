// How often the site checks for changes, so students never need to reload the page.
// React Query pauses these timers while the tab is hidden or the phone is locked, and refreshes
// straight away when the student comes back or the internet reconnects.
export const LIVE_MS = 10_000; // the page the student is looking at
export const BADGE_MS = 20_000; // red badges in the navigation

export const live = { refetchInterval: LIVE_MS, refetchOnWindowFocus: true, refetchOnReconnect: true } as const;
export const badge = { refetchInterval: BADGE_MS, refetchOnWindowFocus: true, refetchOnReconnect: true } as const;
