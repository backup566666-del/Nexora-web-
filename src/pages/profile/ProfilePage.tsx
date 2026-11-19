import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Edit3,
  Film,
  Globe,
  Heart,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  MessageSquare,
  Plus,
  Share2,
  ShieldBan,
  X,
} from 'lucide-react';
import { ResilientImage } from '../../components/common/ResilientImage';
import { VerifiedBadge } from '../../components/common/VerifiedBadge';
import { CoverEditorModal } from '../../components/media/CoverEditorModal';
import { PostCard } from '../../features/posts/PostCard';
import { useAuth } from '../../hooks/useAuth';
import {
  getUserProfile,
  isUsernameAvailable,
  updateUserPrivacySettings,
  updateUserProfileFields,
} from '../../services/auth/authService';
import {
  checkIsFollowing,
  createOrGetDirectConversation,
  toggleFollowUser,
} from '../../services/firebase/socialService';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { Post, Space, UserProfile, Vibe } from '../../types/nexora';
import { formatCompactCount, isValidUsername, normalizeUsername } from '../../utils/validation';

interface ProfilePageProps {
  targetUid: string | null;
  posts: Post[];
  vibes: Vibe[];
  spaces: Space[];
  savedPostIds: string[];
  onOpenProfile: (uid: string) => void;
  onOpenChatThread: (convId: string) => void;
  onOpenVibes: () => void;
}

export function ProfilePage({
  targetUid,
  posts,
  vibes,
  spaces,
  savedPostIds,
  onOpenProfile,
  onOpenChatThread,
  onOpenVibes,
}: ProfilePageProps) {
  const {
    user: firebaseUser,
    profile: currentUser,
    privateInfo,
    getBadgeVariant,
    refreshUserAndProfile,
  } = useAuth();
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [contentTab, setContentTab] = useState<'posts' | 'videos' | 'photos' | 'spaces' | 'saved'>('posts');

  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [uploadingQuickAvatar, setUploadingQuickAvatar] = useState(false);
  const [lightboxMedia, setLightboxMedia] = useState<{
    type: 'image' | 'video';
    url: string;
    caption?: string;
  } | null>(null);

  // Edit profile form
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editInterests, setEditInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const quickAvatarInputRef = useRef<HTMLInputElement>(null);
  const modalAvatarInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !targetUid || targetUid === currentUser?.uid;

  useEffect(() => {
    if (!currentUser) return;
    if (isOwnProfile) {
      setViewedProfile(currentUser);
    } else if (targetUid) {
      void getUserProfile(targetUid).then(setViewedProfile);
      void checkIsFollowing(currentUser.uid, targetUid).then(setIsFollowing);
    }
  }, [targetUid, currentUser, isOwnProfile]);

  const activeProfile = isOwnProfile ? currentUser : viewedProfile;

  // Resolve real uploaded or authenticated profile picture without premature fallback
  const primaryAvatarUrl = useMemo(() => {
    if (!activeProfile) return '';
    if (activeProfile.avatarUrl && activeProfile.avatarUrl.trim().length > 0) {
      return activeProfile.avatarUrl.trim();
    }
    if (isOwnProfile && firebaseUser?.photoURL) {
      return firebaseUser.photoURL;
    }
    return '';
  }, [activeProfile, isOwnProfile, firebaseUser?.photoURL]);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [primaryAvatarUrl]);

  useEffect(() => {
    if (!activeProfile) return;
    setEditName(activeProfile.displayName);
    setEditUsername(activeProfile.username);
    setEditBio(activeProfile.bio || '');
    setEditWebsite(activeProfile.website || '');
    setEditLocation(activeProfile.location || '');
    setEditAvatar(primaryAvatarUrl);
    setEditInterests(activeProfile.interests || []);
    setEditError('');
  }, [activeProfile, primaryAvatarUrl]);

  const userPosts = useMemo(
    () => (activeProfile ? posts.filter((p) => p.authorId === activeProfile.uid) : []),
    [posts, activeProfile]
  );

  const userVibes = useMemo(
    () => (activeProfile ? vibes.filter((v) => v.authorId === activeProfile.uid) : []),
    [vibes, activeProfile]
  );

  const photoPosts = useMemo(
    () =>
      userPosts.filter((p) => p.mediaTypes?.includes('image') && (p.mediaUrls?.length || 0) > 0),
    [userPosts]
  );

  const videoPosts = useMemo(
    () =>
      userPosts.filter((p) => p.mediaTypes?.includes('video') && (p.mediaUrls?.length || 0) > 0),
    [userPosts]
  );

  const savedPosts = useMemo(
    () => posts.filter((p) => savedPostIds.includes(p.id)),
    [posts, savedPostIds]
  );

  const savedVibes = useMemo(
    () => vibes.filter((v) => savedPostIds.includes(v.id)),
    [vibes, savedPostIds]
  );

  const userSpaces = useMemo(
    () => (activeProfile ? spaces.filter((s) => s.ownerId === activeProfile.uid) : []),
    [spaces, activeProfile]
  );

  const totalLikesReceived = useMemo(
    () =>
      userPosts.reduce((acc, p) => acc + (p.likesCount || 0), 0) +
      userVibes.reduce((acc, v) => acc + (v.likesCount || 0), 0),
    [userPosts, userVibes]
  );

  if (!currentUser || !activeProfile) return null;

  const isBlocked = (privateInfo?.blockedUserIds || []).includes(activeProfile.uid);
  const avatarInitial = (activeProfile.displayName || activeProfile.username || 'N')
    .trim()
    .charAt(0)
    .toUpperCase();

  const handleShareProfile = async () => {
    const shareUrl = `${window.location.origin}/?u=${activeProfile.username}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast(`Copied ${shareUrl}`);
    } catch {
      setShareToast(shareUrl);
    }
    setTimeout(() => setShareToast(''), 2800);
  };

  const handleQuickAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQuickAvatar(true);
    try {
      const res = await uploadMediaAsset(file, `users/${currentUser.uid}/avatar`, ['image']);
      await updateUserProfileFields(currentUser.uid, { avatarUrl: res.url });
      setAvatarLoadError(false);
      await refreshUserAndProfile();
    } catch (err) {
      setShareToast(err instanceof Error ? err.message : 'Unable to upload profile photo.');
      setTimeout(() => setShareToast(''), 3000);
    } finally {
      setUploadingQuickAvatar(false);
      e.target.value = '';
    }
  };

  const handleModalAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadMediaAsset(file, `users/${currentUser.uid}/avatar`, ['image']);
      setEditAvatar(res.url);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to upload profile photo.');
    } finally {
      e.target.value = '';
    }
  };

  const handleAddInterest = () => {
    const clean = newInterest.trim();
    if (!clean || editInterests.length >= 10) return;
    if (!editInterests.includes(clean)) {
      setEditInterests((prev) => [...prev, clean]);
    }
    setNewInterest('');
  };

  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError('');
    const normalized = normalizeUsername(editUsername);
    if (!isValidUsername(normalized)) {
      setEditError(
        'Username must be 3-30 characters using lowercase letters, numbers, or underscores.'
      );
      return;
    }
    setSavingEdit(true);
    try {
      if (normalized !== currentUser.username) {
        const available = await isUsernameAvailable(normalized, currentUser.uid);
        if (!available) {
          setEditError(`@${normalized} is already taken.`);
          setSavingEdit(false);
          return;
        }
      }
      await updateUserProfileFields(
        currentUser.uid,
        {
          displayName: editName,
          username: normalized,
          bio: editBio,
          website: editWebsite,
          location: editLocation,
          avatarUrl: editAvatar,
          interests: editInterests,
        },
        currentUser.username
      );
      setAvatarLoadError(false);
      await refreshUserAndProfile();
      setShowEditProfile(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to save profile updates.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!privateInfo) return;
    const nextBlocked = isBlocked
      ? privateInfo.blockedUserIds.filter((id) => id !== activeProfile.uid)
      : [...privateInfo.blockedUserIds, activeProfile.uid];
    await updateUserPrivacySettings(currentUser.uid, privateInfo.privacySettings, nextBlocked);
    await refreshUserAndProfile();
  };

  return (
    <div className="w-full space-y-8">
      {/* 1. COVER BANNER + 2. LEFT OVERLAPPING AVATAR + 3/4/5. RIGHT PROFILE COLUMN */}
      <section className="w-full">
        {/* 1. Large Horizontal Cover Banner with Rounded Corners */}
        <div className="relative h-56 sm:h-64 lg:h-76 w-full rounded-3xl overflow-hidden border border-[#8B5CF6]/20 bg-[#0D0B16] shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
          <ResilientImage
            src={activeProfile.coverUrl}
            alt={`${activeProfile.displayName} cover banner`}
            style={{ objectPosition: `50% ${activeProfile.coverPositionY ?? 50}%` }}
            className="w-full h-full object-cover"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#06060A]/80 via-black/15 to-transparent" />
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setShowCoverEditor(true)}
              className="absolute top-4 right-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/65 hover:bg-black/85 border border-white/15 text-xs font-semibold text-white backdrop-blur-md transition-colors"
            >
              <Edit3 size={13} /> Edit Cover
            </button>
          )}
        </div>

        {/* Profile Split Header: Left = Overlapping Circular Avatar | Right = Info + Compact Stats + Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-[46%_54%] gap-6 md:gap-0 px-4 sm:px-8 lg:px-10 pt-2">
          {/* 2. LEFT-HAND SIDE: Large Circular Overlapping Profile Picture */}
          <div className="flex justify-start items-start">
            <div className="-mt-16 sm:-mt-20 lg:-mt-28 md:ml-4 lg:ml-10 relative z-20 shrink-0">
              <div className="w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 rounded-full p-[3px] bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#C084FC] shadow-[0_12px_40px_rgba(124,58,237,0.4)]">
                <div className="w-full h-full rounded-full overflow-hidden border-4 border-[#06060A] bg-[#120E20] relative">
                  {primaryAvatarUrl && !avatarLoadError ? (
                    <img
                      key={primaryAvatarUrl}
                      src={primaryAvatarUrl}
                      alt={activeProfile.displayName}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarLoadError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      aria-label={activeProfile.displayName}
                      className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2E1065] via-[#131320] to-[#06060A] text-white/85 font-display text-4xl font-bold select-none"
                    >
                      {avatarInitial}
                    </div>
                  )}
                </div>
              </div>

              {isOwnProfile && (
                <>
                  <input
                    ref={quickAvatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleQuickAvatarUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploadingQuickAvatar}
                    onClick={() => quickAvatarInputRef.current?.click()}
                    title="Upload profile picture"
                    aria-label="Upload profile picture"
                    className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-[#0D0B16] hover:bg-[#7C3AED] border border-[#8B5CF6]/50 text-white flex items-center justify-center shadow-lg transition-colors"
                  >
                    <Camera size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 3, 4, 5. RIGHT-HAND SIDE: Starts ~middle of profile section */}
          <div className="pt-1 md:pt-5 flex flex-col items-start">
            {/* Shared constrained width column so Info, Bio, Compact Stats Panel, and Buttons align cleanly */}
            <div className="w-full max-w-[440px] space-y-4">
              {/* 3. Profile Information */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-2xl lg:text-3xl font-bold text-white tracking-tight">
                    {activeProfile.displayName}
                  </h1>
                  {getBadgeVariant(activeProfile.uid, activeProfile.verified) && (
                    <VerifiedBadge
                      size={20}
                      variant={getBadgeVariant(activeProfile.uid, activeProfile.verified)}
                    />
                  )}
                </div>

                <p className="text-sm font-medium text-[#A855F7]">@{activeProfile.username}</p>

                {activeProfile.bio && (
                  <p className="text-sm text-[#E2E8F0] leading-relaxed pt-1.5 break-words">
                    {activeProfile.bio}
                  </p>
                )}

                {(activeProfile.location || activeProfile.website) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-[#94A3B8]">
                    {activeProfile.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={13} className="text-[#A855F7]" />
                        {activeProfile.location}
                      </span>
                    )}
                    {activeProfile.website && (
                      <a
                        href={
                          activeProfile.website.startsWith('http')
                            ? activeProfile.website
                            : `https://${activeProfile.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[#C084FC] hover:underline break-all"
                      >
                        <Globe size={13} />
                        {activeProfile.website}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Compact Statistics Panel — restricted strictly to the right-hand info/bio width */}
              <div className="w-full grid grid-cols-4 divide-x divide-white/10 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 py-2.5 px-1">
                <div className="px-3 text-center">
                  <p className="font-mono-tabular text-base font-bold text-white leading-tight">
                    {formatCompactCount(userPosts.length)}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">Posts</p>
                </div>
                <div className="px-3 text-center">
                  <p className="font-mono-tabular text-base font-bold text-white leading-tight">
                    {formatCompactCount(activeProfile.followersCount)}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">Followers</p>
                </div>
                <div className="px-3 text-center">
                  <p className="font-mono-tabular text-base font-bold text-white leading-tight">
                    {formatCompactCount(activeProfile.followingCount)}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">Following</p>
                </div>
                <div className="px-3 text-center">
                  <p className="font-mono-tabular text-base font-bold text-white leading-tight">
                    {formatCompactCount(totalLikesReceived)}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">Likes</p>
                </div>
              </div>

              {/* 5. Profile Action Buttons — directly underneath compact statistics panel */}
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                {isOwnProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowEditProfile(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.4)] transition-all whitespace-nowrap"
                    >
                      <Edit3 size={14} /> Edit Profile
                    </button>
                    <button
                      type="button"
                      onClick={handleShareProfile}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#8B5CF6]/25 bg-[#0D0B16] hover:border-[#8B5CF6]/60 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                    >
                      <Share2 size={14} /> Share Profile
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = await toggleFollowUser(
                          currentUser,
                          activeProfile,
                          isFollowing
                        );
                        setIsFollowing(next);
                        const fresh = await getUserProfile(activeProfile.uid);
                        if (fresh) setViewedProfile(fresh);
                      }}
                      className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isFollowing
                          ? 'bg-white/10 hover:bg-white/20 text-white'
                          : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]'
                      }`}
                    >
                      {isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const convId = await createOrGetDirectConversation(
                          currentUser,
                          activeProfile
                        );
                        onOpenChatThread(convId);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#8B5CF6]/25 bg-[#0D0B16] hover:border-[#8B5CF6]/60 text-xs font-semibold text-white"
                    >
                      <MessageSquare size={14} /> Message
                    </button>
                    <button
                      type="button"
                      onClick={handleShareProfile}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#8B5CF6]/25 bg-[#0D0B16] hover:border-[#8B5CF6]/60 text-xs font-semibold text-white"
                    >
                      <Share2 size={14} /> Share Profile
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleBlock}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-500/25 text-xs text-rose-300 hover:bg-rose-500/10"
                    >
                      <ShieldBan size={14} /> {isBlocked ? 'Unblock' : 'Block'}
                    </button>
                  </>
                )}
              </div>

              {shareToast && (
                <p className="inline-flex items-center gap-1.5 text-xs text-[#C084FC]">
                  <Check size={13} /> {shareToast}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 6. PROFILE CONTENT TABS: Posts | Videos | Photos | Spaces | Saved */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3.5">
        {[
          { id: 'posts', label: 'Posts', count: userPosts.length },
          { id: 'videos', label: 'Videos', count: videoPosts.length + userVibes.length },
          { id: 'photos', label: 'Photos', count: photoPosts.length },
          { id: 'spaces', label: 'Spaces', count: userSpaces.length },
          ...(isOwnProfile
            ? [{ id: 'saved', label: 'Saved', count: savedPosts.length + savedVibes.length }]
            : []),
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setContentTab(tab.id as typeof contentTab)}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              contentTab === tab.id
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)]'
                : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <span>{tab.label}</span>
            <span className="font-mono-tabular opacity-75">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Responsive Desktop Grids for Tab Content */}
      {contentTab === 'posts' && (
        userPosts.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-1">
            <p className="text-sm font-medium text-white">No posts published yet</p>
            <p className="text-xs text-[#94A3B8]">
              Updates published by @{activeProfile.username} will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {userPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isSaved={savedPostIds.includes(post.id)}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        )
      )}

      {contentTab === 'photos' && (
        photoPosts.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
            <ImageIcon size={24} className="mx-auto text-[#8B5CF6]" />
            <p className="text-sm font-medium text-white">No photos shared yet</p>
            <p className="text-xs text-[#94A3B8]">
              Published photo posts will appear in this gallery grid.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {photoPosts.flatMap((p) =>
              p.mediaUrls.map((url, idx) =>
                p.mediaTypes?.[idx] === 'image' ? (
                  <button
                    key={`${p.id}-${idx}`}
                    type="button"
                    onClick={() => setLightboxMedia({ type: 'image', url, caption: p.text })}
                    className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 bg-[#0D0B16] text-left"
                  >
                    <ResilientImage
                      src={url}
                      alt={p.text || 'Photo post'}
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                    />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent p-4 flex flex-col justify-end">
                      <p className="text-xs text-white line-clamp-2">{p.text}</p>
                      <div className="flex items-center gap-4 text-[11px] text-[#CBD5E1] pt-1 font-mono-tabular">
                        <span className="inline-flex items-center gap-1">
                          <Heart size={12} /> {p.likesCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle size={12} /> {p.commentsCount}
                        </span>
                      </div>
                    </div>
                  </button>
                ) : null
              )
            )}
          </div>
        )
      )}

      {contentTab === 'videos' && (
        videoPosts.length === 0 && userVibes.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
            <Film size={24} className="mx-auto text-[#8B5CF6]" />
            <p className="text-sm font-medium text-white">No videos published yet</p>
            <p className="text-xs text-[#94A3B8]">Uploaded Vibes and video posts will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {userVibes.map((v) => (
              <div
                key={v.id}
                onClick={onOpenVibes}
                className="group relative aspect-[9/13] rounded-2xl overflow-hidden border border-[#8B5CF6]/20 bg-black cursor-pointer"
              >
                <video
                  src={v.videoUrl}
                  poster={v.thumbnailUrl || undefined}
                  muted
                  playsInline
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-4 flex flex-col justify-end space-y-1">
                  <p className="text-xs text-white line-clamp-2">{v.caption}</p>
                  <p className="text-[11px] font-mono-tabular text-[#C084FC]">
                    {formatCompactCount(v.viewsCount)} views · {formatCompactCount(v.likesCount)} likes
                  </p>
                </div>
              </div>
            ))}
            {videoPosts.map((p) => (
              <div
                key={p.id}
                onClick={() =>
                  setLightboxMedia({ type: 'video', url: p.mediaUrls[0], caption: p.text })
                }
                className="group relative aspect-[9/13] rounded-2xl overflow-hidden border border-white/15 bg-black cursor-pointer"
              >
                <video src={p.mediaUrls[0]} muted playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent p-4 flex flex-col justify-end">
                  <p className="text-xs text-white line-clamp-2">{p.text || 'Video update'}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {contentTab === 'spaces' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {userSpaces.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center">
              <p className="text-xs text-[#64748B]">No Spaces created yet.</p>
            </div>
          ) : (
            userSpaces.map((s) => (
              <div
                key={s.id}
                className="relative rounded-2xl overflow-hidden border border-[#8B5CF6]/20 aspect-[16/10]"
              >
                <ResilientImage
                  src={s.coverUrl}
                  alt={s.name}
                  style={{ objectPosition: `50% ${s.coverPositionY ?? 50}%` }}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-transparent p-5 flex flex-col justify-end">
                  <h3 className="font-display text-base font-bold text-white inline-flex items-center gap-1.5">
                    {s.name}
                    {s.verified && <VerifiedBadge size={15} />}
                  </h3>
                  <p className="text-xs text-[#CBD5E1] line-clamp-1">{s.description}</p>
                  <p className="text-[11px] text-[#C084FC] font-mono-tabular pt-1">
                    {s.category} · {s.membersCount} members
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {contentTab === 'saved' && (
        savedPosts.length === 0 && savedVibes.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center text-xs text-[#64748B]">
            Nothing saved yet.
          </div>
        ) : (
          <div className="space-y-6">
            {savedPosts.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {savedPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    isSaved={true}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>
            )}
            {savedVibes.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-white">Saved Vibes</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {savedVibes.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={onOpenVibes}
                      className="relative aspect-[9/14] rounded-xl overflow-hidden border border-[#8B5CF6]/25 bg-black text-left"
                    >
                      <video
                        src={v.videoUrl}
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent p-3 flex flex-col justify-end">
                        <p className="text-[11px] text-white line-clamp-2">{v.caption}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Media Lightbox Modal */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6">
          <div className="relative max-w-4xl w-full bg-[#0D0B16] border border-[#8B5CF6]/25 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setLightboxMedia(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-black/70 text-white hover:bg-black"
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
            {lightboxMedia.type === 'video' ? (
              <video
                src={lightboxMedia.url}
                controls
                autoPlay
                className="w-full max-h-[78vh] bg-black"
              />
            ) : (
              <img
                src={lightboxMedia.url}
                alt="Expanded media"
                className="w-full max-h-[78vh] object-contain bg-black"
              />
            )}
            {lightboxMedia.caption && (
              <p className="p-4 text-xs text-[#E2E8F0] border-t border-white/10">
                {lightboxMedia.caption}
              </p>
            )}
          </div>
        </div>
      )}

      {showCoverEditor && (
        <CoverEditorModal
          title="Edit Profile Cover"
          initialUrl={currentUser.coverUrl}
          initialPositionY={currentUser.coverPositionY}
          uploadFolder={`users/${currentUser.uid}/cover`}
          onSave={async (url, posY) => {
            await updateUserProfileFields(currentUser.uid, {
              coverUrl: url,
              coverPositionY: posY,
            });
            await refreshUserAndProfile();
          }}
          onClose={() => setShowCoverEditor(false)}
        />
      )}

      {/* Full Edit Profile Modal */}
      {showEditProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveProfileEdit}
            className="w-full max-w-xl bg-[#0D0B16] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-semibold text-white">Edit Profile</h2>
              <button type="button" onClick={() => setShowEditProfile(false)}>
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#8B5CF6]/60 bg-[#141420]">
                  {editAvatar ? (
                    <img
                      src={editAvatar}
                      alt="Avatar preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-display font-bold">
                      {avatarInitial}
                    </div>
                  )}
                </div>
                <input
                  ref={modalAvatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleModalAvatarUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => modalAvatarInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                >
                  <Camera size={14} /> Change Profile Photo
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowEditProfile(false);
                  setShowCoverEditor(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C3AED]/15 border border-[#8B5CF6]/30 text-xs font-medium text-[#E9D5FF]"
              >
                <Edit3 size={13} /> Edit Cover Image
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Full Name</span>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-sm text-white outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Username</span>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={30}
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-sm text-white outline-none"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#CBD5E1]">Biography</span>
              <textarea
                rows={3}
                maxLength={400}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full p-3.5 rounded-xl bg-[#06060A] border border-white/10 text-sm text-white outline-none resize-none"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Location</span>
                <input
                  type="text"
                  maxLength={100}
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Berlin, Germany"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Website</span>
                <input
                  type="text"
                  maxLength={200}
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  placeholder="https://nexora.studio"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
                />
              </label>
            </div>

            {/* Interests Editor */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-[#CBD5E1] block">Interests</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={40}
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddInterest();
                    }
                  }}
                  placeholder="Add an interest (e.g. Architecture, Audio)..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddInterest}
                  className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
              {editInterests.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {editInterests.map((interest) => (
                    <span
                      key={interest}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#7C3AED]/15 border border-[#8B5CF6]/25 text-xs text-[#E9D5FF]"
                    >
                      {interest}
                      <button
                        type="button"
                        onClick={() =>
                          setEditInterests((prev) => prev.filter((item) => item !== interest))
                        }
                        aria-label={`Remove ${interest}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {editError && <p className="text-xs text-rose-400">{editError}</p>}

            <div className="flex justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                className="px-4 py-2 text-xs text-[#94A3B8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
