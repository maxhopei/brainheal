import { useState, type FormEvent, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import styles from './AddContentPage.module.css';

type InputType = 'url' | 'text';

function detectInputType(value: string): InputType {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return 'url';
  } catch {
    // not a URL
  }
  return 'text';
}

/**
 * Add content screen.
 * User pastes a URL or types a topic/text.
 * Invokes the ingest Edge Function on submit.
 */
export function AddContentPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const detectedType = detectInputType(value);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;

      setError(null);
      setSubmitting(true);

      try {
        const type = detectInputType(trimmed);
        const { error: invokeError } = await supabase.functions.invoke('ingest', {
          body: { type, value: trimmed },
        });

        if (invokeError) {
          setError(invokeError.message || 'Failed to add content. Please try again.');
          return;
        }

        // Success — navigate back to feed
        navigate('/', { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      } finally {
        setSubmitting(false);
      }
    },
    [value, navigate],
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className={styles.title}>Add Content</h1>
      </header>

      <div className={styles.body}>
        {error && (
          <div className={styles.error} role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputWrapper}>
            {value.trim() && (
              <span className={styles.typeTag} aria-label={`Detected type: ${detectedType}`}>
                {detectedType === 'url' ? '🔗 URL' : '✍ Text'}
              </span>
            )}
            <textarea
              className={styles.textarea}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Paste a URL or type a topic to research…&#10;e.g. https://example.com/article&#10;e.g. What is quantum computing?"
              rows={5}
              autoFocus
              disabled={submitting}
            />
          </div>

          <p className={styles.hint}>
            Paste a URL to summarize an article, or type any topic and BrainHeal will research it for you.
          </p>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting || !value.trim()}
          >
            {submitting ? 'Adding…' : 'Add to feed'}
          </button>
        </form>
      </div>
    </div>
  );
}
