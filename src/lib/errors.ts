import type { TranslationKey } from './i18n';

type Vars = Record<string, string | number>;

/**
 * Error carrying a translation key instead of a raw (English) message.
 * User-facing surfaces must render it through `t()` so every message is
 * localized; the original error is preserved as `cause` for logging.
 */
export class LocalizedError extends Error {
  readonly key: TranslationKey;
  readonly vars?: Vars;

  constructor(
    key: TranslationKey,
    options?: { vars?: Vars; cause?: unknown }
  ) {
    super(key, options && 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'LocalizedError';
    this.key = key;
    this.vars = options?.vars;
  }
}

type Translator = (key: TranslationKey, vars?: Vars) => string;

/**
 * Resolves any thrown value to a localized, user-facing message.
 * Unknown errors are logged (never rendered) and replaced with `fallbackKey`.
 */
export function errorMessage(
  error: unknown,
  t: Translator,
  fallbackKey: TranslationKey
): string {
  if (error instanceof LocalizedError) {
    return t(error.key, error.vars);
  }
  if (error !== undefined && error !== null) {
    console.warn('[error]', error);
  }
  return t(fallbackKey);
}
