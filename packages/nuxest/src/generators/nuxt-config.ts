import type { ScaffoldOptions } from '../types.js';
import {
  WEB_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
} from '../constants.js';

export function generateNuxtConfig(options: ScaffoldOptions): string {
  const ssr = options.nuxtMode === 'ssr';
  const apiBase = nestApiBaseUrl();

  return `// https://nuxt.com/docs/api/configuration/nuxt-config
const nestOrigin = (
  process.env.API_BASE_SERVER ?? '${apiBase}'
).replace(/\\/api\\/?$/, '');
const nuxtDevPort = Number(process.env.WEB_DEV_PORT ?? process.env.NUXT_DEV_PORT ?? ${WEB_DEV_DEFAULT_PORT});
const nuxtDevHost =
  process.env.WEB_DEV_HOST ?? process.env.NUXT_DEV_HOST ?? '127.0.0.1';
const exposeDevServer =
  nuxtDevHost === '0.0.0.0' || nuxtDevHost === 'true' || nuxtDevHost === '::';
const isDev = process.env.NODE_ENV !== 'production';

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  ssr: ${ssr},
  nitro: {
    preset: 'node-listener',
    ...(isDev && {
      devProxy: {
        '/api/': {
          target: \`\${nestOrigin}/api/\`,
          changeOrigin: true,
          prependPath: true,
        },
      },
      routeRules: {
        '/api/**': {
          proxy: \`\${nestOrigin}/api/**\`,
        },
      },
    }),
  },
  vite: {
    server: {
      hmr: exposeDevServer
        ? {
            protocol: 'ws',
            clientPort: nuxtDevPort,
          }
        : {
            protocol: 'ws',
            host: '127.0.0.1',
            port: nuxtDevPort,
            clientPort: nuxtDevPort,
          },
    },
  },
  runtimeConfig: {
    apiBaseServer:
      process.env.API_BASE_SERVER ?? '${apiBase}',
    public: {
      apiBase: '/api',
    },
  },
  devServer: {
    port: nuxtDevPort,
    host: nuxtDevHost,
    strictPort: true,
  },
});
`;
}
