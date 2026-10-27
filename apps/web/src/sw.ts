/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

// App shell: precached at install and served cache-first. API calls are never cached here;
// the sync engine owns them.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
clientsClaim();

/**
 * Background Sync (Chromium): when connectivity returns, wake an open app window and ask it to
 * sync. The session token lives in the page's IndexedDB, so the page does the work.
 */
interface SyncEvent extends ExtendableEvent {
  tag: string;
}
self.addEventListener('sync', ((event: SyncEvent) => {
  if (event.tag !== 'outbox') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) c.postMessage({ type: 'SYNC_NOW' });
    }),
  );
}) as EventListener);
