import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  ssr: false,

  modules: [
    '@nuxt/icon',
    '@pinia/nuxt',
  ],

  components: [
    {
      path: '~/components',
      pattern: '*.vue',
      pathPrefix: false,
    },
    {
      path: '~/components/ui',
      prefix: '',
      pattern: '**/*.vue',
    },
  ],

  vite: {
    plugins: [tailwindcss()],
    // Pre-bundle up front. Left to lazy discovery, Vite finds these in waves
    // on the first page load after a cold start (e.g. `docker compose up`),
    // re-optimizes mid-load, and answers the in-flight imports with
    // "504 Outdated Optimize Dep" — the SPA never mounts and the page is blank
    // until a manual reload.
    optimizeDeps: {
      include: [
        '@lucide/vue',
        '@supabase/supabase-js',
        '@tiptap/core',
        '@tiptap/extension-highlight',
        '@tiptap/extension-image',
        '@tiptap/extension-placeholder',
        '@tiptap/pm/state',
        '@tiptap/starter-kit',
        '@tiptap/suggestion',
        '@tiptap/vue-3',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'docx',
        'pdfmake/build/pdfmake',
        'pdfmake/build/vfs_fonts',
        'reka-ui',
        'tailwind-merge',
        'vue-sonner',
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Allowed browser origins for the unauthenticated /api/documents/export
    // endpoint. Comma-separated list of full origins (scheme + host + port).
    allowedOrigins: process.env.NUXT_ALLOWED_ORIGINS || '',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:58080',
      // Supabase Auth is the identity layer. The publishable (anon) key is
      // designed to ship to browsers; the service-role key never appears here.
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      supabasePublishableKey: process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
      // Where the contact-sales plans point. Configurable so the address can
      // move without a release.
      salesEmail: process.env.NUXT_PUBLIC_SALES_EMAIL || 'secretary@batayan.co',
      // GA4 measurement ID, shared with the marketing site. Empty disables
      // analytics entirely.
      gaMeasurementId: process.env.NUXT_PUBLIC_GA_MEASUREMENT_ID || '',
    },
  },

  app: {
    head: {
      title: 'Batayan',
      charset: 'utf-8',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'theme-color', content: '#1D4533' },
        // The marketing site (batayan.co) is the indexed surface; app screens
        // are thin or private. /login and /register override this.
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      ],
    },
    pageTransition: {
      name: 'page',
      mode: 'out-in',
    },
    // Page transitions already cover navigation. A second transition around
    // NuxtLayout can inspect its async placeholder during redirects and emit
    // the false NUXT_E4002 multi-root diagnostic.
    layoutTransition: false,
  },
})
