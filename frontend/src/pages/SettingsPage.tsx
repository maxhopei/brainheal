import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { Profile } from '@brainheal/shared';
import styles from './SettingsPage.module.css';

/**
 * Settings & Profile screen.
 * Shows user email, billing tier, nickname (editable), and sign-out.
 */
export function SettingsPage() {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState<string>('');
  const [editingNickname, setEditingNickname] = useState<boolean>(false);
  const [savingNickname, setSavingNickname] = useState<boolean>(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const p = data as unknown as Profile;
          setProfile(p);
          setNickname(p.nickname ?? '');
        }
      });
  }, [user]);

  const handleSaveNickname = async () => {
    if (!user) return;
    const trimmed = nickname.trim();
    setSavingNickname(true);
    setNicknameError(null);

    const { error } = await supabase
      .from('profiles')
      .update({ nickname: trimmed || null })
      .eq('id', user.id);

    if (error) {
      if (error.code === '23505') {
        setNicknameError('That nickname is already taken.');
      } else {
        setNicknameError(error.message);
      }
    } else {
      setProfile((prev) => prev ? { ...prev, nickname: trimmed || null } : null);
      setEditingNickname(false);
    }
    setSavingNickname(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </header>

      <div className={styles.body}>
        {/* Account section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Account</h2>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Email</span>
            <span className={styles.rowValue}>{user?.email ?? '—'}</span>
          </div>

          <div className={styles.row}>
            <span className={styles.rowLabel}>Plan</span>
            <span
              className={`${styles.rowValue} ${
                profile?.billing_tier === 'paid' ? styles.paidBadge : ''
              }`}
            >
              {profile?.billing_tier === 'paid' ? '⭐ Paid' : 'Free'}
            </span>
          </div>

          {/* Nickname */}
          <div className={styles.row}>
            <span className={styles.rowLabel}>Nickname</span>
            {editingNickname ? (
              <div className={styles.nicknameEdit}>
                <input
                  className={styles.nicknameInput}
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={30}
                  placeholder="Your nickname"
                  autoFocus
                  disabled={savingNickname}
                />
                {nicknameError && (
                  <p className={styles.fieldError}>{nicknameError}</p>
                )}
                <div className={styles.nicknameActions}>
                  <button
                    className={styles.saveButton}
                    onClick={handleSaveNickname}
                    disabled={savingNickname}
                  >
                    {savingNickname ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className={styles.cancelButton}
                    onClick={() => {
                      setEditingNickname(false);
                      setNicknameError(null);
                      setNickname(profile?.nickname ?? '');
                    }}
                    disabled={savingNickname}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.nicknameDiplay}>
                <span className={styles.rowValue}>
                  {profile?.nickname ?? <em className={styles.muted}>Not set</em>}
                </span>
                <button
                  className={styles.editButton}
                  onClick={() => setEditingNickname(true)}
                  aria-label="Edit nickname"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Sign out */}
        <section className={styles.section}>
          <button
            className={styles.signOutButton}
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>

        {/* App info */}
        <section className={styles.appInfo}>
          <p className={styles.appInfoText}>BrainHeal · v0.1.0</p>
        </section>
      </div>
    </div>
  );
}
