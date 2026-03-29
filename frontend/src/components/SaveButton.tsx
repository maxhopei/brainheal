import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './SaveButton.module.css';

type SaveButtonProps = {
  postId: string;
};

/**
 * Save-to-favorites button.
 * On tap: saves to the user's default "Saved" group.
 * Shows filled star when saved.
 */
export function SaveButton({ postId }: SaveButtonProps) {
  const [saved, setSaved] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const handleSave = useCallback(async () => {
    if (saved || saving) return;
    setSaving(true);

    try {
      // Get the user's default favorite group
      const { data: groups } = await supabase
        .from('favorite_groups')
        .select('id')
        .eq('is_default', true)
        .limit(1)
        .maybeSingle();

      if (!groups?.id) {
        console.error('No default favorite group found');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('favorites').insert({
        user_id: user.id,
        post_id: postId,
        group_id: groups.id,
      });

      if (!error) {
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }, [postId, saved, saving]);

  return (
    <button
      className={`${styles.saveButton} ${saved ? styles.saved : ''}`}
      onClick={handleSave}
      disabled={saving}
      aria-label={saved ? 'Saved to favorites' : 'Save to favorites'}
      aria-pressed={saved}
    >
      {saved ? '★' : '☆'}
    </button>
  );
}
