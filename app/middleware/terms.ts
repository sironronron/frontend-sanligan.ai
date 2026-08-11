export default defineNuxtRouteMiddleware(async (to, from) => {
  // Terms acceptance is handled by TermsAcceptModal, mounted globally in app.vue.
  // This middleware is kept for future use if route-level blocking is needed.
})
