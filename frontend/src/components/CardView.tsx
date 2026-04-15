import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Card } from '@brainheal/storage'
import { LinkContextMenu } from './LinkContextMenu.tsx'
import { useReadNext } from '../hooks/useReadNext.ts'
import styles from './CardView.module.css'

type CardViewProps = {
  card: Card
  postTitle?: string
  isFirstCard?: boolean
  postId?: string
}

type LinkMenuState = {
  url: string
  position: { x: number; y: number }
}

/**
 * Renders a single card based on its content_type.
 * - text: Markdown rendered prose with link interception for "Read next"
 * - key_points: Bulleted list
 * - quote: Styled blockquote with attribution
 * - image: Image with optional caption
 *
 * On the first card, the post title is displayed prominently at the top.
 * If postId is provided, links and text selections can trigger "Read next".
 */
export function CardView({ card, postTitle, isFirstCard, postId }: CardViewProps) {
  const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null)
  const { queueReadNext, status: linkStatus } = useReadNext()

  const handleLinkClick = (e: React.MouseEvent, url: string) => {
    // Only intercept if we have a parent post to attach the "Read next" to
    if (!postId) {
      return
    }
    // Only intercept http/https links — leave anchors and mailto alone
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return
    }
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setLinkMenu({
      url,
      position: { x: rect.left, y: rect.bottom + 6 },
    })
  }

  const handleReadNextLink = async () => {
    if (!linkMenu || !postId) return
    await queueReadNext(linkMenu.url, 'url', postId, card.id)
    if (linkStatus !== 'error') {
      setLinkMenu(null)
    }
  }

  const handleOpenBrowser = () => {
    if (!linkMenu) return
    ;(globalThis as Window).open(linkMenu.url, '_blank', 'noopener,noreferrer')
    setLinkMenu(null)
  }

  // Custom link renderer that intercepts clicks for "Read next"
  const LinkComponent = ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const url = href ?? ''
    return (
      <a
        href={url}
        onClick={(e) => handleLinkClick(e, url)}
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  }

  return (
    <div className={styles.card}>
      {isFirstCard && postTitle && <h2 className={styles.cardTitle}>{postTitle}</h2>}
      <div className={styles.content}>
        {card.content_type === 'text' && (
          <div className={styles.textContent}>
            <ReactMarkdown
              components={postId ? { a: LinkComponent } : undefined}
            >
              {card.text_content ?? ''}
            </ReactMarkdown>
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

      {linkMenu && postId && (
        <LinkContextMenu
          url={linkMenu.url}
          position={linkMenu.position}
          onReadNext={handleReadNextLink}
          onOpenBrowser={handleOpenBrowser}
          onDismiss={() => setLinkMenu(null)}
          status={linkStatus}
        />
      )}
    </div>
  )
}
