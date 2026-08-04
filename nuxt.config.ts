import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
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
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8000',
    },
  },

  app: {
    head: {
      title: 'Saligan.AI',
      htmlAttrs: { lang: 'en' },
    },
  },
})
