import React, { useEffect, useState } from 'react';
import { KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  logoutUser,
  sendPasswordReset,
  updateUserPrivacySettings,
} from '../../services/auth/authService';
import { PrivacySettings, UserProfile } from '../../types/nexora';

interface SettingsPageProps {
  users: UserProfile[];
}

export function SettingsPage({ users }: SettingsPageProps) {
  const { user, profile, privateInfo, refreshUserAndProfile } = useAuth();
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profileVisibility: 'public',
    storyPrivacy: 'public',
    allowDMs: 'everyone',
    showOnlineStatus: true,
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (privateInfo?.privacySettings) {
      setPrivacy(privateInfo.privacySettings);
    }
  }, [privateInfo]);

  if (!profile || !user) return null;

  const blockedUsers = users.filter((u) =>
    (privateInfo?.blockedUserIds || []).includes(u.uid)
  );

  const handleSavePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      await updateUserPrivacySettings(
        profile.uid,
        privacy,
        privateInfo?.blockedUserIds || []
      );
      await refreshUserAndProfile();
      setNotice('Privacy controls saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    if (!privateInfo) return;
    const next = privateInfo.blockedUserIds.filter((id) => id !== targetUid);
    await updateUserPrivacySettings(profile.uid, privacy, next);
    await refreshUserAndProfile();
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Settings & Privacy</h1>
        <p className="text-sm text-[#94A3B8]">
          Manage your security, audience visibility, blocked accounts, and active session.
        </p>
      </div>

      {/* Account Security Summary */}
      <section className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4">
        <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
          <ShieldCheck size={17} className="text-[#C084FC]" /> Account & Verification
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
            <p className="text-[#64748B]">Email Address (Private)</p>
            <p className="text-white font-medium mt-1">{user.email}</p>
          </div>
          <div className="p-3.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/15">
            <p className="text-[#64748B]">Email Verification</p>
            <p className="text-emerald-400 font-medium mt-1">
              {user.emailVerified ? 'Verified' : 'Pending verification'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={async () => {
              if (!user.email) return;
              await sendPasswordReset(user.email);
              setNotice('Password reset email dispatched.');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-medium text-white"
          >
            <KeyRound size={14} /> Send Password Reset Email
          </button>
          <button
            type="button"
            onClick={() => void logoutUser(profile.uid)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/25 text-xs font-medium text-rose-300"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </section>

      {/* Privacy Controls */}
      <form
        onSubmit={handleSavePrivacy}
        className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4"
      >
        <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
          <Lock size={17} className="text-[#C084FC]" /> Privacy Controls
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Profile Visibility</span>
            <select
              value={privacy.profileVisibility}
              onChange={(e) =>
                setPrivacy((p) => ({
                  ...p,
                  profileVisibility: e.target.value as 'public' | 'followers',
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            >
              <option value="public">Public</option>
              <option value="followers">Followers Only</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Default Story Privacy</span>
            <select
              value={privacy.storyPrivacy}
              onChange={(e) =>
                setPrivacy((p) => ({
                  ...p,
                  storyPrivacy: e.target.value as PrivacySettings['storyPrivacy'],
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            >
              <option value="public">Everyone</option>
              <option value="followers">Followers</option>
              <option value="close">Close Circle</option>
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Direct Messages</span>
            <select
              value={privacy.allowDMs}
              onChange={(e) =>
                setPrivacy((p) => ({
                  ...p,
                  allowDMs: e.target.value as 'everyone' | 'followers',
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            >
              <option value="everyone">Everyone on Nexora</option>
              <option value="followers">People you follow</option>
            </select>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-[#CBD5E1] pt-6 cursor-pointer">
            <input
              type="checkbox"
              checked={privacy.showOnlineStatus}
              onChange={(e) =>
                setPrivacy((p) => ({ ...p, showOnlineStatus: e.target.checked }))
              }
              className="accent-[#7C3AED]"
            />
            Show online presence in Chat
          </label>
        </div>

        {notice && <p className="text-xs text-[#C084FC]">{notice}</p>}

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]"
        >
          {saving ? 'Saving...' : 'Save Privacy Settings'}
        </button>
      </form>

      {/* Blocked Users */}
      <section className="p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-3">
        <h2 className="font-display text-base font-semibold text-white">Blocked Accounts</h2>
        {blockedUsers.length === 0 ? (
          <p className="text-xs text-[#64748B]">You have not blocked any accounts.</p>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {blockedUsers.map((u) => (
              <div key={u.uid} className="py-2.5 flex items-center justify-between text-xs">
                <span className="text-white">
                  {u.displayName} (@{u.username})
                </span>
                <button
                  type="button"
                  onClick={() => void handleUnblock(u.uid)}
                  className="text-[#C084FC] hover:underline"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
