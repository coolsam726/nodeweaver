// https://nuxt.com/docs/api/configuration/nuxt-config
const nestOrigin = (
  process.env.API_BASE_SERVER ?? 'http://127.0.0.1:3000/api'
).replace(/\/api\/?$/, '');
const isDev = process.env.NODE_ENV !== 'production';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: true,
  nitro: {
    preset: 'node-listener',
    ...(isDev && {
      // Browser requests to Nuxt dev (port 3001) still use `/api` on the client.
      devProxy: {
        '/api/': {
          target: `${nestOrigin}/api/`,
          changeOrigin: true,
          prependPath: true,
        },
      },
      // `$fetch` / `useFetch` with relative `/api/*` during SSR in dev.
      routeRules: {
        '/api/**': {
          proxy: `${nestOrigin}/api/**`,
        },
      },
    }),
  },
  runtimeConfig: {
    apiBaseServer:
      process.env.API_BASE_SERVER ?? 'http://127.0.0.1:3000/api',
    public: {
      apiBase: '/api',
    },
  },
  devServer: {
    port: 3001,
    host: '127.0.0.1',
  },
});
