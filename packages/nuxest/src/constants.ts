/** Default NestJS listen port (user-facing HTTP entry). */
export const NEST_DEFAULT_PORT = 4000;

/** Default frontend dev server port (internal; proxied by Nest in dev). */
export const WEB_DEV_DEFAULT_PORT = 3000;

/** @deprecated Use WEB_DEV_DEFAULT_PORT. */
export const NUXT_DEV_DEFAULT_PORT = WEB_DEV_DEFAULT_PORT;

export function nestApiBaseUrl(port = NEST_DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}/api`;
}

export function nestLocalUrl(port = NEST_DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}`;
}

export function webDevUrl(port = WEB_DEV_DEFAULT_PORT): string {
  return `http://127.0.0.1:${port}`;
}

/** @deprecated Use webDevUrl. */
export function nuxtDevUrl(port = WEB_DEV_DEFAULT_PORT): string {
  return webDevUrl(port);
}

/** Host user/group for Docker Compose (avoids root-owned node_modules). */
export function scaffoldHostIds(): { uid: number; gid: number } {
  return {
    uid: typeof process.getuid === 'function' ? process.getuid() : 1000,
    gid: typeof process.getgid === 'function' ? process.getgid() : 1000,
  };
}
