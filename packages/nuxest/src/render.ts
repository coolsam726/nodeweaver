import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { WEB_DEV_DEFAULT_PORT, NEST_DEFAULT_PORT } from './constants.js';
import { FRONTEND_LABELS } from './frontend.js';
import { isNuxtSsr, isSpaFrontend } from './frontend.js';
import { needsDockerServices } from './generators/docker-compose.js';
import type { TemplateContext } from './types.js';
import { dockerInfraServiceNames } from './generators/docker-compose.js';

Handlebars.registerHelper('eq', (a, b) => a === b);

export function renderTemplate(
  source: string,
  context: TemplateContext,
): string {
  return Handlebars.compile(source, { noEscape: true })(context);
}

export function renderFile(
  filePath: string,
  context: TemplateContext,
): string {
  return renderTemplate(readFileSync(filePath, 'utf8'), context);
}

export function toContext(
  options: import('./types.js').ScaffoldOptions,
): TemplateContext {
  return {
    ...options,
    sharedScope: `@${options.projectName}/shared`,
    frontendLabel: FRONTEND_LABELS[options.frontend],
    isNuxt: options.frontend === 'nuxt',
    isVite: options.frontend !== 'nuxt',
    isNuxtSsr: isNuxtSsr(options),
    isSsr: isNuxtSsr(options),
    isSpa: isSpaFrontend(options),
    isFastify: options.httpAdapter === 'fastify',
    isExpress: options.httpAdapter === 'express',
    hasDatabase: options.orm !== 'none',
    dockerServices: needsDockerServices(options),
    infraServices: dockerInfraServiceNames(options).join(' '),
    hasInfraServices: dockerInfraServiceNames(options).length > 0,
    nestPort: NEST_DEFAULT_PORT,
    webDevPort: WEB_DEV_DEFAULT_PORT,
    nuxtDevPort: WEB_DEV_DEFAULT_PORT,
    admin: options.admin,
    orm: options.orm,
  } as TemplateContext & {
    admin: boolean;
    orm: string;
  };
}
