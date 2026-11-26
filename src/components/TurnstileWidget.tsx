import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../lib/config';
import { useI18n } from '../lib/i18n';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme?: 'light' | 'dark' | 'auto';
      language?: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    }
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile-api="true"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          existing.remove();
          scriptLoadPromise = null;
          reject(new Error('Failed to load Turnstile'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.dataset.turnstileApi = 'true';
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptLoadPromise = null;
      reject(new Error('Failed to load Turnstile'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/** Drop the cached script so the retry button can attempt a fresh load. */
function resetTurnstileScript(): void {
  scriptLoadPromise = null;
  document
    .querySelectorAll('script[data-turnstile-api="true"]')
    .forEach((node) => node.remove());
}

type TurnstileState = 'loading' | 'interactive' | 'solved' | 'error';

interface TurnstileWidgetProps {
  action:
    | 'teacher_auth'
    | 'teacher_login'
    | 'teacher_register'
    | 'student_register'
    | 'student_recover';
  onToken: (token: string | null) => void;
  resetTrigger: number;
}

/**
 * Cloudflare Turnstile wrapper. The widget collapses once a token is issued
 * (nothing for the user to do) and stays visible when interaction is required
 * or when the challenge failed.
 */
export function TurnstileWidget({
  action,
  onToken,
  resetTrigger,
}: TurnstileWidgetProps) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const [state, setState] = useState<TurnstileState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!CONFIG.TURNSTILE_SITE_KEY) return;
    let active = true;
    setState('loading');

    void loadTurnstileScript()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: CONFIG.TURNSTILE_SITE_KEY,
          action,
          theme: 'auto',
          language: locale === 'pt-BR' ? 'pt-br' : 'en',
          callback: (token) => {
            onTokenRef.current(token);
            setState('solved');
          },
          'expired-callback': () => {
            onTokenRef.current(null);
            setState('interactive');
          },
          'error-callback': () => {
            onTokenRef.current(null);
            setState('error');
          },
        });
        setState('interactive');
      })
      .catch(() => {
        if (!active) return;
        onTokenRef.current(null);
        setState('error');
      });

    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [action, locale, reloadKey]);

  useEffect(() => {
    if (resetTrigger > 0 && widgetIdRef.current && window.turnstile) {
      onTokenRef.current(null);
      window.turnstile.reset(widgetIdRef.current);
      setState('interactive');
    }
  }, [resetTrigger]);

  const retry = useCallback(() => {
    onTokenRef.current(null);
    if (window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current);
      setState('interactive');
      return;
    }
    resetTurnstileScript();
    setState('loading');
    setReloadKey((key) => key + 1);
  }, []);

  if (!CONFIG.TURNSTILE_SITE_KEY) return null;

  return (
    <div className="stack-sm">
      <div
        style={{
          display: state === 'solved' ? 'none' : 'block',
        }}
      >
        <div ref={containerRef} style={{ minHeight: 65 }} />
      </div>
      {state === 'error' && (
        <div
          className="row"
          style={{ gap: '0.5rem', alignItems: 'center' }}
        >
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('turnstileError')}
          </span>
          <button type="button" className="btn btn-sm" onClick={retry}>
            {t('turnstileRetry')}
          </button>
        </div>
      )}
    </div>
  );
}
