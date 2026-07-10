import type { Frontend, ScaffoldOptions } from './types.js';

export const FRONTEND_LABELS: Record<Frontend, string> = {
  nuxt: 'Nuxt 4',
  'vite-react': 'Vite + React',
  'vite-vue': 'Vite + Vue',
  'vite-svelte': 'Vite + Svelte',
};

export function isNuxtSsr(options: ScaffoldOptions): boolean {
  return options.frontend === 'nuxt' && options.nuxtMode === 'ssr';
}

export function isSpaFrontend(options: ScaffoldOptions): boolean {
  return options.frontend !== 'nuxt' || options.nuxtMode === 'spa';
}

export function isViteFrontend(options: ScaffoldOptions): boolean {
  return options.frontend !== 'nuxt';
}
