const EN: Record<string, string> = {
  'auth.signIn': 'Sign in',
  'auth.signInContinue': 'Sign in to continue',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.forgotPassword': 'Forgot password?',
  'auth.invalidCredentials': 'Invalid email or password',
  'auth.resetSent':
    'If an account exists for that email, password reset instructions have been sent.',
  'flash.created.title': 'Created',
  'flash.created.message': 'The record was saved successfully.',
  'flash.updated.title': 'Updated',
  'flash.updated.message': 'Your changes have been saved.',
  'flash.deleted.title': 'Deleted',
  'flash.deleted.message': 'The record was removed.',
  'flash.restored.title': 'Restored',
  'flash.restored.message': 'The record was restored.',
  'list.trash': 'Trash',
  'list.active': 'Active',
  'action.restore': 'Restore',
  'action.delete': 'Delete',
  'action.cancel': 'Cancel',
  'dialog.loading': 'Loading…',
  'dialog.close': 'Close',
  'dialog.confirm': 'Confirm',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.untitled': 'Untitled',
};

const CATALOGS: Record<string, Record<string, string>> = {
  en: EN,
};

export type LoomTranslator = (key: string, fallback?: string) => string;

export function createTranslator(
  locale = 'en',
  overrides?: Record<string, string>,
): LoomTranslator {
  const base = CATALOGS[locale] ?? EN;
  const catalog = { ...base, ...overrides };
  return (key, fallback) => catalog[key] ?? fallback ?? key;
}

export function builtinMessages(locale = 'en'): Record<string, string> {
  return { ...(CATALOGS[locale] ?? EN) };
}
