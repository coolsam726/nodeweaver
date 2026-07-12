const warned = new Set<string>();

/**
 * Log a one-time deprecation warning (skipped when `LOOM_DEPRECATION_WARNINGS=0`).
 */
export function warnLoomDeprecated(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (process.env.LOOM_DEPRECATION_WARNINGS === '0') return;
  console.warn(`[Loom deprecation] ${message}`);
}

/** Reset warnings — for tests. */
export function resetLoomDeprecationWarnings(): void {
  warned.clear();
}
