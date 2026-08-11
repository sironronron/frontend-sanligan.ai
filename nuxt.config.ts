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
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    // Allowed browser origins for the unauthenticated /api/documents/export
    // endpoint. Comma-separated list of full origins (scheme + host + port).
    allowedOrigins: process.env.NUXT_ALLOWED_ORIGINS || '',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000',
    },
  },

  app: {
    head: {
      title: 'Batayan',
      charset: 'utf-8',
      htmlAttrs: { lang: 'en' },
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
      ],
    },
    pageTransition: {
      name: 'page',
      mode: 'out-in',
    },
    layoutTransition: {
      name: 'layout',
      mode: 'out-in',
    },
  },
})
