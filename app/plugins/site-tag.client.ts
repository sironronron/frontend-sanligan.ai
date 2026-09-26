// Deliberately not named analytics/gtag/tracking: in dev this file is served
// at its source path, and ad blockers matching those words block it — which
// takes the whole app down with it (blank page).
/**
 * Loads GA4 when NUXT_PUBLIC_GA_MEASUREMENT_ID is set. The marketing site
 * (batayan.co) uses the same measurement ID, and GA scopes its cookie to the
 * registrable domain, so a visitor who clicks a landing-page CTA keeps one
 * client ID through to the `sign_up` event fired here.
 *
 * page_view is sent from the router rather than by gtag's config call, since
 * this is a client-rendered SPA and gtag would only see the first load.
 */
export default defineNuxtPlugin(() => {
  const measurementId = useRuntimeConfig().public.gaMeasurementId

  if (!measurementId) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // gtag.js expects the `arguments` object itself, not a spread array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false })

  useHead({
    script: [{ src: `https://www.googletagmanager.com/gtag/js?id=${measurementId}`, async: true }],
  })

  useRouter().afterEach((to) => {
    window.gtag?.('event', 'page_view', {
      // Strip query strings: auth callbacks carry codes and tokens in them.
      page_path: to.path,
      page_location: window.location.origin + to.path,
    })
  })
})
