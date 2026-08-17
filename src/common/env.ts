/** Javanese yes/no used by the IS_VO1D_* toggles. */
const YES = 'nggih';
const NO = 'mboten';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value;
}

/**
 * Reads an IS_VO1D_* toggle. Throws on anything other than `nggih`/`mboten` so
 * a typo fails at boot instead of silently flipping behaviour.
 */
export function envToggle(name: string): boolean {
  const value = requireEnv(name).trim().toLowerCase();

  if (value === YES) return true;
  if (value === NO) return false;

  throw new Error(
    `${name} must be "${YES}" (yes) or "${NO}" (no), got "${value}"`,
  );
}

/** Reads a comma-separated env var into a trimmed, non-empty list. */
export function envList(name: string, fallback: string[] = []): string[] {
  const value = optionalEnv(name, '');
  if (!value) return fallback;

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const isProduction = (): boolean => envToggle('IS_VO1D_PRODUCTION');
export const isTesting = (): boolean => envToggle('IS_VO1D_TESTING');
