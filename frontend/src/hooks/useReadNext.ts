import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

export type ReadNextStatus = 'idle' | 'loading' | 'success' | 'error'

export type UseReadNextResult = {
  queueReadNext: (
    value: string,
    type: 'text' | 'url',
    parentPostId: string,
    parentCardId: string,
  ) => Promise<string | null>
  status: ReadNextStatus
}

export function useReadNext(): UseReadNextResult {
  const [status, setStatus] = useState<ReadNextStatus>('idle')

  const queueReadNext = async (
    value: string,
    type: 'text' | 'url',
    parentPostId: string,
    parentCardId: string,
  ): Promise<string | null> => {
    setStatus('loading')
    try {
      const { data, error } = await supabase.functions.invoke<{ feed_item_id: string }>('ingest', {
        body: {
          type,
          value,
          parent_post_id: parentPostId,
          parent_card_id: parentCardId,
        },
      })

      if (error || !data?.feed_item_id) {
        toast.error('Failed to queue item — please try again')
        setStatus('error')
        setTimeout(() => setStatus('idle'), 2000)
        return null
      }

      setStatus('success')
      setTimeout(() => setStatus('idle'), 2000)
      return data.feed_item_id
    } catch {
      toast.error('Failed to queue item — please try again')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
      return null
    }
  }

  return { queueReadNext, status }
}
