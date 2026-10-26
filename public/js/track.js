// Reports a button tap (e.g. "demo", "share_group") for the private stats page.
// Only the action name is sent: nothing about the chat, no cookies, no IDs.
export function track(name) {
  try {
    navigator.sendBeacon?.("/api/event", JSON.stringify({ e: name }));
  } catch {
    /* analytics must never break the app */
  }
}
