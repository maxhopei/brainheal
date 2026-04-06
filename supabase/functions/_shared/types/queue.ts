export type QueueItemStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Input type for queue items
 */
export type InputType = 'url' | 'text';

/**
 * Queue item (matches queue_items table)
 */
export type QueueItem = {
  id: string;
  user_id: string;
  input_type: InputType;
  input_value: string;
  status: QueueItemStatus;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};
