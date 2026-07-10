import type { Frontend, ScaffoldOptions } from './types.js';

export const FRONTEND_LABELS: Record<Frontend, string> = {
  nuxt: 'Nuxt 4',
  angular: 'Angular 22',
  'vite-react': 'Vite + React',
  'vite-vue': 'Vite + Vue',
  'vite-svelte': 'Vite + Svelte',
};

export function isSsrFrontend(options: ScaffoldOptions): boolean {
  return (
    options.renderMode === 'ssr' &&
    (options.frontend === 'nuxt' || options.frontend === 'angular')
  );
}

/** @deprecated Use isSsrFrontend */
export function isNuxtSsr(options: ScaffoldOptions): boolean {
  return isSsrFrontend(options);
}

export function isSpaFrontend(options: ScaffoldOptions): boolean {
  return !isSsrFrontend(options);
}

export function isViteFrontend(options: ScaffoldOptions): boolean {
  return options.frontend.startsWith('vite-');
}

export function supportsRenderMode(frontend: Frontend): boolean {
  return frontend === 'nuxt' || frontend === 'angular';
}
