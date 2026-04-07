import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { QueueItem } from '@brainheal/storage'
import styles from './QueuePage.module.css'

const POLL_INTERVAL_MS = 5000
const DELETE_DELAY_MS = 3000

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(dateStr).toLocaleDateString()
}

type QueueItemRowProps = {
  item: QueueItem
  onRetry: (item: QueueItem) => void
  onDelete: (item: QueueItem) => void
  isPendingDelete: boolean
  deleteProgress: number
  onUndoDelete: () => void
}

function QueueItemRow({ item, onRetry, onDelete, isPendingDelete, deleteProgress, onUndoDelete }: QueueItemRowProps) {
  const truncated = item.input_value.length > 80 ? `${item.input_value.slice(0, 77)}…` : item.input_value

  const statusColors: Record<string, string> = {
    pending: 'var(--color-text-subtle)',
    processing: 'var(--color-warning)',
    completed: 'var(--color-success)',
    failed: 'var(--color-error)',
  }

  const canDelete = item.status === 'pending' || item.status === 'failed'

  return (
    <div className={`${styles.row} ${isPendingDelete ? styles.rowPendingDelete : ''}`}>
      <div className={styles.rowHeader}>
        <span className={styles.statusBadge} style={{ color: statusColors[item.status] ?? 'var(--color-text-muted)' }}>
          {item.status === 'processing' && <span className={styles.processingDot} aria-hidden="true" />}
          {item.status}
        </span>
        <span className={styles.time}>{formatRelativeTime(item.created_at)}</span>
      </div>

      <p className={styles.inputValue}>{truncated}</p>

      {item.status === 'failed' && item.error_message && <p className={styles.errorMessage}>{item.error_message}</p>}

      <div className={styles.rowActions}>
        {item.status === 'failed' && !isPendingDelete && (
          <button type="button" className={styles.retryButton} onClick={() => onRetry(item)}>
            Retry
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className={`${styles.deleteButton} ${isPendingDelete ? styles.deleteButtonPending : ''}`}
            onClick={() => (isPendingDelete ? onUndoDelete() : onDelete(item))}
          >
            {isPendingDelete ? (
              <>
                <span
                  className={styles.deleteProgress}
                  style={{ width: `${(1 - deleteProgress) * 100}%` }}
                  aria-hidden="true"
                />
                <span className={styles.deleteButtonText}>Undo</span>
              </>
            ) : (
              'Delete'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Processing queue screen.
 * Shows all submitted queue items with their status.
 * Polls every 5 seconds for updates. Shows retry button for failed items.
 * Delete button for pending/failed items with 3s undo window.
 */
export function QueuePage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleteProgress, setDeleteProgress] = useState<number>(0)
  const deleteTimerRef = useRef<number | null>(null)
  const progressIntervalRef = useRef<number | null>(null)

  const fetchItems = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('queue_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setItems((data ?? []) as unknown as QueueItem[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
    const interval = setInterval(fetchItems, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchItems])

  const clearDeleteTimers = useCallback(() => {
    if (deleteTimerRef.current) {
      clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }, [])

  const handleDelete = useCallback(
    (item: QueueItem) => {
      clearDeleteTimers()
      setPendingDeleteId(item.id)
      setDeleteProgress(0)

      const startTime = Date.now()
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime
        setDeleteProgress(Math.min(elapsed / DELETE_DELAY_MS, 1))
      }, 50)

      deleteTimerRef.current = setTimeout(() => {
        clearDeleteTimers()
        supabase
          .from('queue_items')
          .delete()
          .eq('id', item.id)
          .then(({ error: deleteError }) => {
            if (!deleteError) {
              setItems((prev) => prev.filter((i) => i.id !== item.id))
            }
            setPendingDeleteId(null)
            setDeleteProgress(0)
          })
      }, DELETE_DELAY_MS)
    },
    [clearDeleteTimers],
  )

  const handleUndoDelete = useCallback(() => {
    clearDeleteTimers()
    setPendingDeleteId(null)
    setDeleteProgress(0)
  }, [clearDeleteTimers])

  useEffect(() => {
    return () => clearDeleteTimers()
  }, [clearDeleteTimers])

  const handleRetry = async (item: QueueItem) => {
    const { error: invokeError } = await supabase.functions.invoke('ingest', {
      body: { type: item.input_type, value: item.input_value },
    })
    if (!invokeError) {
      navigate('/')
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Processing Queue</h1>
        <span className={styles.pollIndicator} aria-label="Auto-refreshing" title="Auto-refreshing every 5 seconds">
          ↻
        </span>
      </header>

      <div className={styles.body}>
        {loading && items.length === 0 && (
          <div className={styles.loading} aria-label="Loading queue…">
            <div className={styles.spinner} />
          </div>
        )}

        {error && (
          <div className={styles.error} role="alert">
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyIcon} aria-hidden="true">
              ◎
            </p>
            <p className={styles.emptyText}>Queue is empty</p>
          </div>
        )}

        <ul className={styles.list} aria-label="Queue items">
          {items.map((item) => (
            <li key={item.id}>
              <QueueItemRow
                item={item}
                onRetry={handleRetry}
                onDelete={handleDelete}
                isPendingDelete={pendingDeleteId === item.id}
                deleteProgress={deleteProgress}
                onUndoDelete={handleUndoDelete}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
