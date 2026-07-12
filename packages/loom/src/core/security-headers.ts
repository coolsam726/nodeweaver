import type { LoomBranding } from './branding.js';

export interface LoomSecurityHeadersConfig {
  /** Default `true` when `securityHeaders` is enabled. */
  enabled?: boolean;
  /**
   * Content-Security-Policy value. Default: Loom-compatible baseline (Alpine CDN +
   * inline theme boot script). Set `false` to omit CSP.
   */
  contentSecurityPolicy?: string | false;
  /** Emit CSP as `Content-Security-Policy-Report-Only` instead of enforcing. */
  contentSecurityPolicyReportOnly?: boolean;
  /** HSTS header value, e.g. `max-age=31536000; includeSubDomains`. Default: off. */
  strictTransportSecurity?: string | false;
  /** Override or disable individual headers (`false` removes a default). */
  headers?: Record<string, string | false>;
}

export type LoomSecurityHeadersOption = boolean | LoomSecurityHeadersConfig;

type ResponseLike = {
  setHeader?: (name: string, value: string) => void;
  header?: (name: string, value: string) => unknown;
};

const DEFAULT_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Resolve module option into an active config, or `null` when disabled. */
export function resolveSecurityHeadersConfig(
  securityHeaders: LoomSecurityHeadersOption | undefined,
): LoomSecurityHeadersConfig | null {
  if (securityHeaders === false) return null;
  if (securityHeaders === undefined) return null;
  if (securityHeaders === true) return { enabled: true };
  if (securityHeaders.enabled === false) return null;
  return { enabled: true, ...securityHeaders };
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Baseline CSP that works with Loom's bundled admin UI (inline theme script,
 * Alpine from jsDelivr, same-origin assets). Tighten further with nonces or
 * self-hosted Alpine when you need stricter policies.
 */
export function defaultLoomContentSecurityPolicy(
  branding?: Partial<LoomBranding>,
): string {
  const fontOrigin = branding?.fontUrl ? hostFromUrl(branding.fontUrl) : null;
  const styleSrc = fontOrigin
    ? `'self' 'unsafe-inline' ${fontOrigin}`
    : `'self' 'unsafe-inline' https:`;

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export function buildLoomSecurityHeaders(
  config: LoomSecurityHeadersConfig,
  branding?: Partial<LoomBranding>,
): Record<string, string> {
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };

  if (config.headers) {
    for (const [name, value] of Object.entries(config.headers)) {
      if (value === false) {
        delete headers[name];
      } else {
        headers[name] = value;
      }
    }
  }

  const csp =
    config.contentSecurityPolicy === false
      ? null
      : (config.contentSecurityPolicy ?? defaultLoomContentSecurityPolicy(branding));

  if (csp) {
    const cspHeader = config.contentSecurityPolicyReportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
    headers[cspHeader] = csp;
  }

  if (config.strictTransportSecurity) {
    headers['Strict-Transport-Security'] = config.strictTransportSecurity;
  }

  return headers;
}

export function applyLoomSecurityHeaders(
  res: ResponseLike,
  config: LoomSecurityHeadersConfig,
  branding?: Partial<LoomBranding>,
): void {
  const headers = buildLoomSecurityHeaders(config, branding);
  for (const [name, value] of Object.entries(headers)) {
    if (typeof res.setHeader === 'function') {
      res.setHeader(name, value);
    } else if (typeof res.header === 'function') {
      res.header(name, value);
    }
  }
}
