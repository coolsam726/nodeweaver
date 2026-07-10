import type { ScaffoldOptions } from '../types.js';
import {
  WEB_DEV_DEFAULT_PORT,
  nestApiBaseUrl,
} from '../constants.js';

const VITE_PLUGINS: Record<
  Exclude<ScaffoldOptions['frontend'], 'nuxt'>,
  { importPlugin: string; plugin: string }
> = {
  'vite-react': {
    importPlugin: "import react from '@vitejs/plugin-react';",
    plugin: 'react()',
  },
  'vite-vue': {
    importPlugin: "import vue from '@vitejs/plugin-vue';",
    plugin: 'vue()',
  },
  'vite-svelte': {
    importPlugin: "import { svelte } from '@sveltejs/vite-plugin-svelte';",
    plugin: 'svelte()',
  },
};

export function generateViteConfig(options: ScaffoldOptions): string {
  if (options.frontend === 'nuxt') {
    throw new Error('generateViteConfig called for nuxt frontend');
  }

  const { importPlugin, plugin } = VITE_PLUGINS[options.frontend];
  const apiBase = nestApiBaseUrl();

  return `import { defineConfig } from 'vite';
${importPlugin}

const nestOrigin = (
  process.env.API_BASE_SERVER ?? '${apiBase}'
).replace(/\\/api\\/?$/, '');
const webDevPort = Number(
  process.env.WEB_DEV_PORT ?? process.env.NUXT_DEV_PORT ?? ${WEB_DEV_DEFAULT_PORT},
);
const webDevHost =
  process.env.WEB_DEV_HOST ?? process.env.NUXT_DEV_HOST ?? '127.0.0.1';
const exposeDevServer =
  webDevHost === '0.0.0.0' || webDevHost === 'true' || webDevHost === '::';

export default defineConfig({
  plugins: [${plugin}],
  server: {
    port: webDevPort,
    host: webDevHost,
    strictPort: true,
    ...(exposeDevServer && {
      hmr: {
        clientPort: webDevPort,
      },
    }),
    proxy: {
      '/api': {
        target: nestOrigin,
        changeOrigin: true,
      },
    },
  },
});
`;
}
