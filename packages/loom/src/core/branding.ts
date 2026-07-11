export interface LoomBranding {
  brandName: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  copyrightText?: string;
  fontFamily: string;
  fontUrl?: string;
  primaryColor: string;
  accentColor: string;
}

export const DEFAULT_LOOM_BRANDING: LoomBranding = {
  brandName: 'Admin',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  primaryColor: '#f1511b',
  accentColor: '#286291',
};

export const LOOM_BRANDING_ENV_KEYS = {
  brandName: 'LOOM_BRAND_NAME',
  logoUrl: 'LOOM_BRAND_LOGO_URL',
  logoDarkUrl: 'LOOM_BRAND_LOGO_DARK_URL',
  copyrightText: 'LOOM_BRAND_COPYRIGHT',
  fontFamily: 'LOOM_BRAND_FONT_FAMILY',
  fontUrl: 'LOOM_BRAND_FONT_URL',
  primaryColor: 'LOOM_BRAND_PRIMARY_COLOR',
  accentColor: 'LOOM_BRAND_ACCENT_COLOR',
} as const;

function readBrandingEnv(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key];
  return value?.trim() || undefined;
}

export function brandingFromEnv(
  env: Record<string, string | undefined> = process.env,
): Partial<LoomBranding> {
  const branding: Partial<LoomBranding> = {};

  const brandName = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.brandName);
  if (brandName) branding.brandName = brandName;

  const logoUrl = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.logoUrl);
  if (logoUrl) branding.logoUrl = logoUrl;

  const logoDarkUrl = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.logoDarkUrl);
  if (logoDarkUrl) branding.logoDarkUrl = logoDarkUrl;

  const copyrightText = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.copyrightText);
  if (copyrightText) branding.copyrightText = copyrightText;

  const fontFamily = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.fontFamily);
  if (fontFamily) branding.fontFamily = fontFamily;

  const fontUrl = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.fontUrl);
  if (fontUrl) branding.fontUrl = fontUrl;

  const primaryColor = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.primaryColor);
  if (primaryColor) branding.primaryColor = normalizeHexColor(primaryColor);

  const accentColor = readBrandingEnv(env, LOOM_BRANDING_ENV_KEYS.accentColor);
  if (accentColor) branding.accentColor = normalizeHexColor(accentColor);

  return branding;
}

export function mergeBranding(
  base: LoomBranding,
  override?: Partial<LoomBranding>,
): LoomBranding {
  if (!override) return { ...base };
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(override).filter(([, value]) => value !== undefined && value !== ''),
    ),
  };
}

export function resolveBranding(
  moduleBranding?: Partial<LoomBranding>,
  companyBranding?: Partial<LoomBranding>,
  legacyTitle?: string,
): LoomBranding {
  const modulePartial: Partial<LoomBranding> = { ...moduleBranding };
  if (legacyTitle && !modulePartial.brandName) {
    modulePartial.brandName = legacyTitle;
  }
  let resolved = mergeBranding(DEFAULT_LOOM_BRANDING, modulePartial);
  resolved = mergeBranding(resolved, companyBranding);
  return resolved;
}

export function buildBrandingCss(branding: LoomBranding): string {
  const primary = normalizeHexColor(branding.primaryColor) ?? DEFAULT_LOOM_BRANDING.primaryColor;
  const accent = normalizeHexColor(branding.accentColor) ?? DEFAULT_LOOM_BRANDING.accentColor;
  const fontFamily = branding.fontFamily;

  return `/* Loom admin branding — generated at runtime */
:root {
  --loom-font-family: ${fontFamily};
  --color-primary-500: ${primary};
  --color-primary-50: color-mix(in srgb, ${primary} 10%, white);
  --color-primary-100: color-mix(in srgb, ${primary} 20%, white);
  --color-primary-200: color-mix(in srgb, ${primary} 35%, white);
  --color-primary-300: color-mix(in srgb, ${primary} 55%, white);
  --color-primary-400: color-mix(in srgb, ${primary} 78%, white);
  --color-primary-600: color-mix(in srgb, ${primary} 88%, black);
  --color-primary-700: color-mix(in srgb, ${primary} 75%, black);
  --color-primary-800: color-mix(in srgb, ${primary} 62%, black);
  --color-primary-900: color-mix(in srgb, ${primary} 48%, black);
  --color-primary-950: color-mix(in srgb, ${primary} 32%, black);
  --color-loom-primary: ${primary};
  --color-loom-primary-50: color-mix(in srgb, ${primary} 10%, white);
  --color-loom-primary-100: color-mix(in srgb, ${primary} 20%, white);
  --color-loom-primary-600: ${primary};
  --color-loom-primary-700: color-mix(in srgb, ${primary} 75%, black);
  --color-loom-primary-800: color-mix(in srgb, ${primary} 62%, black);
  --color-fg-brand: ${primary};
  --color-fg-brand-strong: color-mix(in srgb, ${primary} 62%, black);
  --color-brand-soft: color-mix(in srgb, ${primary} 20%, white);
  --color-brand-softer: color-mix(in srgb, ${primary} 20%, white);
  --color-default: color-mix(in srgb, ${primary} 35%, white);
  --color-neutral-secondary: color-mix(in srgb, ${primary} 10%, white);
  --color-neutral-tertiary: color-mix(in srgb, ${primary} 20%, white);
  --color-loom-shell: color-mix(in srgb, color-mix(in srgb, ${primary} 10%, white) 35%, white);
  --color-loom-accent: ${accent};
  --color-loom-accent-50: color-mix(in srgb, ${accent} 12%, white);
  --color-loom-accent-100: color-mix(in srgb, ${accent} 22%, white);
  --color-loom-accent-600: ${accent};
  --color-loom-accent-700: color-mix(in srgb, ${accent} 78%, black);
}

.dark {
  --color-fg-brand: ${primary};
  --color-fg-brand-strong: color-mix(in srgb, ${primary} 78%, white);
  --color-brand-soft: color-mix(in srgb, ${primary} 48%, black);
  --color-brand-softer: color-mix(in srgb, ${primary} 32%, black);
  --color-loom-shell: var(--color-gray-800);
  --color-neutral-primary: var(--color-gray-900);
  --color-neutral-secondary: var(--color-gray-800);
  --color-neutral-tertiary: #151c28;
  --color-default: var(--color-gray-700);
  --color-surface-hover: color-mix(in srgb, var(--color-gray-700) 50%, var(--color-gray-900));
  --color-surface-header: color-mix(in srgb, var(--color-gray-800) 65%, var(--color-gray-900));
  --color-surface-inset: color-mix(in srgb, var(--color-gray-800) 55%, var(--color-gray-900));
  --color-surface-row-hover: color-mix(in srgb, var(--color-gray-700) 35%, var(--color-gray-900));
  --color-badge-neutral: color-mix(in srgb, var(--color-gray-700) 45%, var(--color-gray-900));
}

body {
  font-family: var(--loom-font-family);
}
`;
}

export function normalizeHexColor(value: string): string | undefined {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) return undefined;
  const hex = match[1]!;
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((char) => char + char)
      .join('')}`;
  }
  return `#${hex.toLowerCase()}`;
}
