import ReactMarkdown from 'react-markdown';
import type { Card } from '@brainheal/storage';
import styles from './CardView.module.css';

type CardViewProps = {
  card: Card;
};

/**
 * Renders a single card based on its content_type.
 * - text: Markdown rendered prose
 * - key_points: Bulleted list
 * - quote: Styled blockquote with attribution
 * - image: Image with optional caption
 */
export function CardView({ card }: CardViewProps) {
  return (
    <div className={styles.card}>
      <div className={styles.content}>
        {card.content_type === 'text' && (
          <div className={styles.textContent}>
            <ReactMarkdown>{card.text_content ?? ''}</ReactMarkdown>
          </div>
        )}

        {card.content_type === 'key_points' && (
          <div className={styles.keyPointsContent}>
            <p className={styles.keyPointsLabel} aria-hidden="true">Key points</p>
            <ul className={styles.keyPointsList}>
              {(card.text_content ?? '').split('\n').filter(Boolean).map((line, i) => (
                <li key={i} className={styles.keyPointsItem}>
                  {line.startsWith('- ') ? line.slice(2) : line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {card.content_type === 'quote' && (
          <div className={styles.quoteContent}>
            {(card.text_content ?? '').split('\n\n— ').map((part, i) =>
              i === 0 ? (
                <blockquote key={i} className={styles.blockquote}>
                  {part.replace(/^> /, '')}
                </blockquote>
              ) : (
                <cite key={i} className={styles.attribution}>
                  — {part}
                </cite>
              ),
            )}
          </div>
        )}

        {card.content_type === 'image' && card.media_url && (
          <figure className={styles.imageContent}>
            <img
              src={card.media_url}
              alt={card.media_caption ?? 'Article image'}
              className={styles.image}
              loading="lazy"
            />
            {card.media_caption && (
              <figcaption className={styles.caption}>{card.media_caption}</figcaption>
            )}
          </figure>
        )}
      </div>
    </div>
  );
}
