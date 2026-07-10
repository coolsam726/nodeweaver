import type { ScaffoldOptions } from '../types.js';
import {
  NEST_DEFAULT_PORT,
  NUXT_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
} from '../constants.js';

export function generateNuxtConfig(options: ScaffoldOptions): string {
  const ssr = options.nuxtMode === 'ssr';
  const apiBase = nestApiBaseUrl();

  return `// https://nuxt.com/docs/api/configuration/nuxt-config
const nestOrigin = (
  process.env.API_BASE_SERVER ?? '${apiBase}'
).replace(/\\/api\\/?$/, '');
const nuxtDevPort = Number(process.env.NUXT_DEV_PORT ?? ${NUXT_DEV_DEFAULT_PORT});
const nuxtDevHost = process.env.NUXT_DEV_HOST ?? '127.0.0.1';
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
      hmr: {
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

export function generateIndexVue(options: ScaffoldOptions): string {
  const ssrFetch = options.nuxtMode === 'ssr';

  const apiBaseBlock = ssrFetch
    ? `const apiBase = import.meta.server
  ? (config.apiBaseServer as string)
  : (config.public.apiBase as string);`
    : `const apiBase = config.public.apiBase as string;`;

  return `<script setup lang="ts">
import type { HealthResponse } from '@${options.projectName}/shared';

const config = useRuntimeConfig();
${apiBaseBlock}

const { data: health, error } = await useFetch<HealthResponse>(
  \`\${apiBase}/health\`,
  { key: 'health' },
);
</script>

<template>
  <div class="page">
    <h1>${options.projectName}</h1>
    <p>NestJS + Nuxt 4 monorepo scaffolded with nuxest.</p>

    <section v-if="health" class="card">
      <h2>API health</h2>
      <p><strong>Status:</strong> {{ health.status }}</p>
      <p><strong>Timestamp:</strong> {{ health.timestamp }}</p>
    </section>

    <section v-else-if="error" class="card error">
      <h2>API unreachable</h2>
      <p>{{ error.message }}</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  font-family: system-ui, sans-serif;
  max-width: 40rem;
  margin: 3rem auto;
  padding: 0 1rem;
  line-height: 1.5;
}

.card {
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  background: #fafafa;
}

.error {
  border-color: #f5c2c7;
  background: #f8d7da;
}
</style>
`;
}
