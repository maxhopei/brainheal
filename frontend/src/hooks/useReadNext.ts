import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ReadNextStatus = 'idle' | 'loading' | 'success' | 'error'

export type UseReadNextResult = {
  queueReadNext: (
    value: string,
    type: 'text' | 'url',
    parentPostId: string,
    parentCardId: string,
  ) => Promise<void>
  status: ReadNextStatus
}

export function useReadNext(): UseReadNextResult {
  const [status, setStatus] = useState<ReadNextStatus>('idle')

  const queueReadNext = async (
    value: string,
    type: 'text' | 'url',
    parentPostId: string,
    parentCardId: string,
  ): Promise<void> => {
    setStatus('loading')
    try {
      const { error } = await supabase.functions.invoke('ingest', {
        body: {
          type,
          value,
          parent_post_id: parentPostId,
          parent_card_id: parentCardId,
        },
      })

      if (error) {
        console.error('Read next failed:', error)
        setStatus('error')
        return
      }

      setStatus('success')
      // Reset to idle after showing success
      setTimeout(() => setStatus('idle'), 2000)
    } catch (err) {
      console.error('Read next failed:', err)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  return { queueReadNext, status }
}
