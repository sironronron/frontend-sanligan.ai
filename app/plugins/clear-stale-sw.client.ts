/**
 * The app ships no service worker (no PWA module, no `public/sw.js`), but a
 * browser that ran an earlier PWA experiment on this origin may still have a
 * stale worker registered — one whose precache no longer contains `/`, so
 * every navigation throws workbox's `non-precached-url`. Unregister anything
 * found on load so the live app always serves, never a cached shell.
 */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return

  // The unregistered worker still controls this load; reload once so the page
  // runs worker-free. Session-guarded so it can never loop.
  const RELOADED_KEY = 'batayan:sw-cleared'

  navigator.serviceWorker.getRegistrations().then(registrations => (
    Promise.all(registrations.map(registration => registration.unregister())).then(() => {
      if (registrations.length > 0 && !sessionStorage.getItem(RELOADED_KEY)) {
        sessionStorage.setItem(RELOADED_KEY, '1')
        window.location.reload()
      }
    })
  )).catch(() => {
    // Offline or restricted context: leave whatever is there; the app loads anyway.
  })
})
