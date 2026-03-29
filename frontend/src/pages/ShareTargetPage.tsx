import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import styles from './ShareTargetPage.module.css';

type ShareState = 'pending' | 'submitting' | 'success' | 'error';

/**
 * PWA Share Target handler.
 * When the user shares a URL or text to BrainHeal via the OS share sheet,
 * this page receives the data via query params and auto-invokes the ingest function.
 *
 * The manifest.json share_target is configured to use GET with ?url=&text=&title= params.
 */
export function ShareTargetPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<ShareState>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sharedUrl = searchParams.get('url') ?? '';
    const sharedText = searchParams.get('text') ?? '';
    const sharedTitle = searchParams.get('title') ?? '';

    // Determine what to ingest
    const candidate = sharedUrl.trim() || sharedText.trim() || sharedTitle.trim();

    if (!candidate) {
      // Nothing to ingest — go back to feed
      navigate('/', { replace: true });
      return;
    }

    const doIngest = async () => {
      setState('submitting');

      let type: 'url' | 'text' = 'text';
      let value = candidate;

      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          type = 'url';
          value = candidate;
        }
      } catch {
        // not a URL
        type = 'text';
      }

      try {
        const { error: invokeError } = await supabase.functions.invoke('ingest', {
          body: { type, value },
        });

        if (invokeError) {
          setState('error');
          setError(invokeError.message || 'Failed to save content.');
          return;
        }

        setState('success');
        // Redirect to feed after a brief success message
        setTimeout(() => navigate('/', { replace: true }), 1200);
      } catch (err) {
        setState('error');
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    };

    doIngest();
  }, []); // Run once on mount

  return (
    <div className={styles.container}>
      {(state === 'pending' || state === 'submitting') && (
        <>
          <div className={styles.spinner} aria-hidden="true" />
          <p className={styles.label}>Saving to BrainHeal…</p>
        </>
      )}

      {state === 'success' && (
        <>
          <span className={styles.icon} aria-hidden="true">✓</span>
          <p className={styles.label}>Saved! Taking you to your feed.</p>
        </>
      )}

      {state === 'error' && (
        <>
          <span className={`${styles.icon} ${styles.errorIcon}`} aria-hidden="true">⚠</span>
          <p className={styles.label}>Something went wrong</p>
          {error && <p className={styles.errorText}>{error}</p>}
          <button
            className={styles.retryButton}
            onClick={() => navigate('/', { replace: true })}
          >
            Go to feed
          </button>
        </>
      )}
    </div>
  );
}
