import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { FavoriteGroup, Favorite } from '@brainheal/storage';
import styles from './FavoritesPage.module.css';

type GroupWithFavorites = FavoriteGroup & {
  favorites: (Favorite & { post: { id: string; title: string; source_url: string | null } | null })[];
};

/**
 * Favorites screen.
 * Left sidebar with groups; main area with posts in selected group.
 */
export function FavoritesPage() {
  const [groups, setGroups] = useState<GroupWithFavorites[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [creatingGroup, setCreatingGroup] = useState<boolean>(false);

  const fetchGroups = async () => {
    const { data, error: fetchError } = await supabase
      .from('favorite_groups')
      .select(`
        id, name, position, is_default, created_at, user_id,
        favorites(
          id, user_id, post_id, group_id, created_at,
          post:posts(id, title, source_url)
        )
      `)
      .order('position', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      const fetched = (data ?? []) as unknown as GroupWithFavorites[];
      setGroups(fetched);
      if (!selectedGroupId && fetched.length > 0) {
        setSelectedGroupId(fetched[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);

    const maxPosition = groups.reduce((max, g) => Math.max(max, g.position), -1);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error: insertError } = await supabase.from('favorite_groups').insert({
      user_id: user.id,
      name,
      position: maxPosition + 1,
      is_default: false,
    });

    if (!insertError) {
      setNewGroupName('');
      fetchGroups();
    }
    setCreatingGroup(false);
  };

  const handleDeleteGroup = async (groupId: string) => {
    await supabase.from('favorite_groups').delete().eq('id', groupId);
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    fetchGroups();
  };

  const handleRemoveFavorite = async (favoriteId: string) => {
    await supabase.from('favorites').delete().eq('id', favoriteId);
    fetchGroups();
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Favorites</h1>
      </header>

      {loading && (
        <div className={styles.loading} aria-label="Loading favorites…">
          <div className={styles.spinner} />
        </div>
      )}

      {error && (
        <div className={styles.error} role="alert">⚠ {error}</div>
      )}

      {!loading && (
        <div className={styles.layout}>
          {/* Groups sidebar */}
          <aside className={styles.sidebar}>
            <ul className={styles.groupList} role="listbox" aria-label="Favorite groups">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    role="option"
                    aria-selected={group.id === selectedGroupId}
                    className={`${styles.groupItem} ${group.id === selectedGroupId ? styles.groupItemActive : ''}`}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <span className={styles.groupName}>{group.name}</span>
                    <span className={styles.groupCount}>
                      {group.favorites?.length ?? 0}
                    </span>
                  </button>
                  {!group.is_default && (
                    <button
                      className={styles.deleteGroupButton}
                      onClick={() => handleDeleteGroup(group.id)}
                      aria-label={`Delete group "${group.name}"`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {/* New group */}
            <div className={styles.newGroup}>
              <input
                className={styles.newGroupInput}
                type="text"
                placeholder="New group…"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                maxLength={50}
              />
              <button
                className={styles.newGroupButton}
                onClick={handleCreateGroup}
                disabled={creatingGroup || !newGroupName.trim()}
                aria-label="Create group"
              >
                +
              </button>
            </div>
          </aside>

          {/* Favorites list */}
          <main className={styles.main}>
            {!selectedGroup && (
              <div className={styles.emptyState}>
                <p className={styles.emptyIcon} aria-hidden="true">★</p>
                <p className={styles.emptyText}>Select a group</p>
              </div>
            )}

            {selectedGroup && selectedGroup.favorites.length === 0 && (
              <div className={styles.emptyState}>
                <p className={styles.emptyIcon} aria-hidden="true">★</p>
                <p className={styles.emptyText}>No saved posts yet</p>
              </div>
            )}

            {selectedGroup && (
              <ul className={styles.favoriteList} aria-label={`Posts in ${selectedGroup.name}`}>
                {selectedGroup.favorites.map((fav) => (
                  <li key={fav.id} className={styles.favoriteItem}>
                    <div className={styles.favoriteContent}>
                      <p className={styles.favoriteTitle}>
                        {fav.post?.title ?? 'Untitled'}
                      </p>
                      {fav.post?.source_url && (
                        <a
                          href={fav.post.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.favoriteSource}
                        >
                          {(() => {
                            try {
                              return new URL(fav.post.source_url).hostname.replace(/^www\./, '');
                            } catch {
                              return fav.post.source_url;
                            }
                          })()}
                          ↗
                        </a>
                      )}
                    </div>
                    <button
                      className={styles.removeFavoriteButton}
                      onClick={() => handleRemoveFavorite(fav.id)}
                      aria-label={`Remove "${fav.post?.title ?? 'post'}" from favorites`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
