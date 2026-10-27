/** Fired when a request is turned away because the session is gone or no longer approved (HTTP 401). */
export const AUTH_REQUIRED_EVENT = "mqi-auth-required";

/**
 * Plain function, not React, so the offline sync and photo upload code can
 * raise it without importing the auth provider. Whatever was being sent stays
 * where it is (a queued survey stays queued, a photo stays "retry") — this
 * only tells the app to ask for sign-in.
 */
export function notifyAuthRequired(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}
