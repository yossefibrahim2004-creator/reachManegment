// Lightweight pub/sub so the TopBar bell refreshes its unread count the
// moment a notification is marked read anywhere in the app, instead of
// waiting for the 30s poll.
const CHANGED_EVENT = "notifications:unread-changed";

export function emitUnreadChanged(): void {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function subscribeUnreadChanged(callback: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, callback);
  return () => window.removeEventListener(CHANGED_EVENT, callback);
}
