/*
 * v2 (W61): the start screen shown before the app's code has loaded. It paints at once, so the
 * Android app's logo splash goes away even on a slow phone or signal, and it never leaves the user
 * stuck: if the app has not started after a while, or one of its files could not load, it offers
 * "Try again" and "Repair". Repair removes only the app's cached files (service worker and Cache
 * Storage) and reloads; drafts and unsent surveys (IndexedDB) are not touched.
 * A plain script (no modules, no build step): it must run even when the app's own code cannot.
 */
(function () {
  var started = Date.now();
  var STUCK_AFTER_MS = 12000;
  var RELOADED_KEY = 'mqi-boot-reloaded';

  function byId(id) {
    return document.getElementById(id);
  }
  function remember(reason) {
    try {
      localStorage.setItem(
        'mqi-boot-failed',
        JSON.stringify({
          reason: reason,
          at: new Date().toISOString(),
          waitedMs: Date.now() - started,
          online: navigator.onLine,
          controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
          userAgent: navigator.userAgent,
        }),
      );
    } catch {
      /* storage blocked: nothing to remember */
    }
  }
  function stuck(reason) {
    if (window.__mqiStarted) return;
    remember(reason);
    var box = byId('boot-stuck');
    if (box) box.hidden = false;
    var msg = byId('boot-message');
    if (msg) msg.textContent = navigator.onLine === false ? 'The app is taking long to open and this phone is offline.' : 'The app is taking long to open.';
  }

  // A file the start page needs could not load (usually: a newer version replaced it). One reload
  // fetches the current start page; after that, show the way out instead of reloading again.
  window.addEventListener(
    'error',
    function (e) {
      if (window.__mqiStarted) return; // the app is running: its own recovery takes over
      var t = e.target;
      if (!t) return;
      var code = t.tagName === 'SCRIPT' || (t.tagName === 'LINK' && /stylesheet|modulepreload/.test(t.rel || ''));
      if (!code) return; // e.g. a font preload: not a reason to reload
      var what = t.src || t.href || t.tagName;
      var last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0;
      } catch {
        last = Date.now();
      }
      if (Date.now() - last > 60000) {
        try {
          sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
        remember('file ' + what + ' (reloading once)');
        location.reload();
        return;
      }
      stuck('file ' + what);
    },
    true,
  );

  setTimeout(function () {
    stuck('timeout');
  }, STUCK_AFTER_MS);

  function repair() {
    var tasks = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(
            regs.map(function (r) {
              return r.unregister();
            }),
          );
        }),
      );
    }
    if (window.caches && caches.keys) {
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (k) {
              return caches.delete(k);
            }),
          );
        }),
      );
    }
    remember('repair');
    Promise.all(tasks)
      .catch(function () {
        /* reload anyway */
      })
      .then(function () {
        location.replace('/');
      });
  }

  function wire() {
    var retry = byId('boot-retry');
    var fix = byId('boot-repair');
    if (retry) retry.onclick = function () { location.reload(); };
    if (fix) fix.onclick = repair;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
