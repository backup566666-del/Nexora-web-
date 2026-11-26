import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  Camera,
  Check,
  Copy,
  Edit3,
  Film,
  Gift,
  Globe,
  Heart,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  MessageSquare,
  Palette,
  Plus,
  Share2,
  ShieldBan,
  ShieldCheck,
  Sparkles,
  Tag,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { resolveAssetUrl } from '../../assets/defaultAssets';
import { AdminPresenceSelector, PresenceBadge } from '../../components/common/PresenceBadge';
import { ResilientImage } from '../../components/common/ResilientImage';
import { TierBadge } from '../../components/common/TierBadge';
import { BadgeStrip, VerifiedBadge } from '../../components/common/VerifiedBadge';
import { GiftPickerModal } from '../../components/gifts/GiftPickerModal';
import { CoverEditorModal } from '../../components/media/CoverEditorModal';
import {
  ProfileEffectLayer,
  resolveBannerBackground,
  resolveGradientStyle,
} from '../../components/profile/ProfileEffectLayer';
import { ProfileTasksPanel } from '../../components/rewards/ProfileTasksPanel';
import { PostCard } from '../../features/posts/PostCard';
import { useAuth } from '../../hooks/useAuth';
import {
  getUserProfile,
  isUsernameAvailable,
  updateUserPrivacySettings,
  updateUserProfileFields,
} from '../../services/auth/authService';
import { recordProfileVisit } from '../../services/firebase/analyticsService';
import {
  buildReferralShareUrl,
  emptyWalletAccount,
  ensurePersonalInvitationCode,
  subscribeMyInvitations,
  subscribeMyReferralClaims,
  subscribeMyTaskSubmissions,
  subscribeMyWallet,
  subscribeRewardsConfig,
  subscribeTasks,
} from '../../services/firebase/rewardsService';
import {
  createOrGetDirectConversation,
  respondToCollaborationInvite,
  subscribeIsFollowing,
  subscribeUserGifts,
  subscribeUserProfile,
  toggleFollowUser,
} from '../../services/firebase/socialService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import {
  GiftTransaction,
  InvitationRecord,
  NavSection,
  Post,
  ProfileContentTab,
  ReferralClaim,
  RewardsConfig,
  Space,
  TaskItem,
  TaskSubmission,
  UserProfile,
  Vibe,
  WalletAccount,
} from '../../types/nexora';
import {
  DEFAULT_REWARDS_CONFIG,
  formatCompactCount,
  formatRelativeTime,
  isPersonalTimelinePost,
  isValidUsername,
  normalizeUsername,
  sanitizeProfileCustomisation,
} from '../../utils/validation';

interface ProfilePageProps {
  targetUid: string | null;
  initialTab?: ProfileContentTab;
  posts: Post[];
  vibes: Vibe[];
  spaces: Space[];
  users?: UserProfile[];
  savedPostIds: string[];
  onOpenProfile: (uid: string) => void;
  onOpenChatThread: (convId: string) => void;
  onOpenVibes: () => void;
  onOpenVerification?: () => void;
  onNavigate?: (
    section: NavSection,
    targetId?: string,
    profileTab?: ProfileContentTab
  ) => void;
}

export function ProfilePage({
  targetUid,
  initialTab,
  posts,
  vibes,
  spaces,
  users = [],
  savedPostIds,
  onOpenProfile,
  onOpenChatThread,
  onOpenVibes,
  onOpenVerification,
  onNavigate,
}: ProfilePageProps) {
  const {
    user: firebaseUser,
    profile: currentUser,
    privateInfo,
    myRole,
    myAdminManualMode,
    myAdminSelfStatus,
    effectiveTier,
    customisationCatalog,
    getUserBadges,
    getUserTier,
    isUserOfficialOwner,
    isUserPlatformVerified,
    getAdminEffectiveStatus,
    setMyAdminStatus,
    refreshUserAndProfile,
  } = useAuth();
  const [presenceBusy, setPresenceBusy] = useState(false);
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [contentTab, setContentTab] = useState<ProfileContentTab>(initialTab || 'posts');
  const [giftsViewTab, setGiftsViewTab] = useState<'received' | 'sent'>('received');
  const [userGifts, setUserGifts] = useState<{
    received: GiftTransaction[];
    sent: GiftTransaction[];
  }>({ received: [], sent: [] });
  const [showGiftModal, setShowGiftModal] = useState(false);

  // Own-profile Rewards, Tasks & Invitation live state
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskSubmissions, setTaskSubmissions] = useState<TaskSubmission[]>([]);
  const [wallet, setWallet] = useState<WalletAccount>(() =>
    emptyWalletAccount(currentUser?.uid || '')
  );
  const [rewardsConfig, setRewardsConfig] = useState<RewardsConfig>(DEFAULT_REWARDS_CONFIG);
  const [myInvitations, setMyInvitations] = useState<InvitationRecord[]>([]);
  const [myReferralClaims, setMyReferralClaims] = useState<ReferralClaim[]>([]);
  const [quickInviteFallback, setQuickInviteFallback] = useState<InvitationRecord | null>(null);
  const [copiedQuickInvite, setCopiedQuickInvite] = useState(false);

  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [uploadingQuickAvatar, setUploadingQuickAvatar] = useState(false);
  const [uploadingModalAvatar, setUploadingModalAvatar] = useState(false);
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
    if (initialTab) {
      setContentTab(initialTab === 'tasks' && !isOwnProfile ? 'posts' : initialTab);
    }
  }, [initialTab, isOwnProfile]);

  useEffect(() => {
    if (!isOwnProfile && contentTab === 'tasks') {
      setContentTab('posts');
    }
  }, [isOwnProfile, contentTab]);

  useEffect(() => {
    if (!currentUser) return;
    if (isOwnProfile) {
      setViewedProfile(currentUser);
      setIsFollowing(false);
      setFollowLoading(false);
      return;
    }
    if (!targetUid) return;

    setFollowLoading(true);
    let cancelled = false;
    void getUserProfile(targetUid)
      .then((loaded) => {
        if (!cancelled) setViewedProfile(loaded);
      })
      .catch(() => {
        if (!cancelled) setViewedProfile(null);
      });

    const unsubProfile = subscribeUserProfile(targetUid, (fresh) => {
      if (!cancelled) setViewedProfile(fresh);
    });
    const unsubFollowing = subscribeIsFollowing(currentUser.uid, targetUid, (following) => {
      if (!cancelled) {
        setIsFollowing(following);
        setFollowLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubProfile();
      unsubFollowing();
    };
  }, [targetUid, currentUser?.uid, isOwnProfile]);

  const activeProfile = isOwnProfile ? currentUser : viewedProfile;

  useEffect(() => {
    if (!activeProfile?.uid) return;
    if (currentUser?.uid && activeProfile.uid !== currentUser.uid) {
      void recordProfileVisit(activeProfile.uid, currentUser.uid);
    }
    return subscribeUserGifts(activeProfile.uid, setUserGifts);
  }, [activeProfile?.uid, currentUser?.uid]);

  useEffect(() => {
    if (!isOwnProfile || !currentUser?.uid) {
      setTasks([]);
      setTaskSubmissions([]);
      setMyInvitations([]);
      setMyReferralClaims([]);
      setQuickInviteFallback(null);
      return;
    }
    const uid = currentUser.uid;
    const u1 = subscribeTasks(setTasks);
    const u2 = subscribeMyTaskSubmissions(uid, setTaskSubmissions);
    const u3 = subscribeMyWallet(uid, setWallet);
    const u4 = subscribeRewardsConfig(setRewardsConfig);
    const u5 = subscribeMyInvitations(uid, setMyInvitations);
    const u6 = subscribeMyReferralClaims(uid, setMyReferralClaims);
    void ensurePersonalInvitationCode(currentUser)
      .then((rec) => {
        if (rec) setQuickInviteFallback(rec);
      })
      .catch(() => {});
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, [isOwnProfile, currentUser?.uid]);

  const activeFreeTasks = useMemo(
    () => tasks.filter((t) => t.active && t.freeToParticipate),
    [tasks]
  );

  const personalInvite = useMemo(
    () => myInvitations.find((i) => i.kind === 'personal') || quickInviteFallback,
    [myInvitations, quickInviteFallback]
  );

  // Resolve real uploaded or authenticated profile picture without premature fallback
  const primaryAvatarUrl = useMemo(() => {
    if (!activeProfile) return '';
    if (activeProfile.avatarUrl && activeProfile.avatarUrl.trim().length > 0) {
      return resolveAssetUrl(activeProfile.avatarUrl.trim());
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
    if (!activeProfile || showEditProfile) return;
    setEditName(activeProfile.displayName);
    setEditUsername(activeProfile.username);
    setEditBio(activeProfile.bio || '');
    setEditWebsite(activeProfile.website || '');
    setEditLocation(activeProfile.location || '');
    setEditAvatar(activeProfile.avatarUrl?.trim() || primaryAvatarUrl);
    setEditInterests(activeProfile.interests || []);
    setEditError('');
  }, [activeProfile?.uid, showEditProfile]);

  // Community Isolation: profile timelines only ever surface intentional personal profile posts.
  const personalPosts = useMemo(() => posts.filter(isPersonalTimelinePost), [posts]);

  const userPosts = useMemo(
    () => (activeProfile ? personalPosts.filter((p) => p.authorId === activeProfile.uid) : []),
    [personalPosts, activeProfile]
  );

  const taggedPosts = useMemo(
    () =>
      activeProfile
        ? personalPosts.filter((p) => (p.taggedUids || []).includes(activeProfile.uid))
        : [],
    [personalPosts, activeProfile]
  );

  const pendingCollabInvites = useMemo(
    () =>
      activeProfile && isOwnProfile
        ? personalPosts.filter(
            (p) =>
              (p.collaboratorInviteUids || []).includes(activeProfile.uid) &&
              !(p.collaboratorUids || []).includes(activeProfile.uid) &&
              !(p.declinedCollaboratorUids || []).includes(activeProfile.uid)
          )
        : [],
    [personalPosts, activeProfile, isOwnProfile]
  );

  const collabPosts = useMemo(
    () =>
      activeProfile
        ? personalPosts.filter(
            (p) =>
              (p.collaboratorUids || []).includes(activeProfile.uid) ||
              (isOwnProfile && pendingCollabInvites.some((inv) => inv.id === p.id))
          )
        : [],
    [personalPosts, activeProfile, isOwnProfile, pendingCollabInvites]
  );

  const receivedGifts = userGifts.received;
  const sentGifts = isOwnProfile ? userGifts.sent : [];

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
    () => personalPosts.filter((p) => savedPostIds.includes(p.id)),
    [personalPosts, savedPostIds]
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

  const activeBadges = getUserBadges(activeProfile.uid, activeProfile.verified);
  const activeTier = isOwnProfile
    ? effectiveTier
    : getUserTier(activeProfile.uid, activeProfile.subscriptionTier);
  const rawCustomisation = activeProfile.profileCustomisation || null;
  const resolvedCustomisation = rawCustomisation
    ? sanitizeProfileCustomisation(rawCustomisation, activeTier)
    : null;
  const bannerBg = resolveBannerBackground(resolvedCustomisation, customisationCatalog);
  const gradientStyle = resolveGradientStyle(resolvedCustomisation, customisationCatalog);
  const accentColor = resolvedCustomisation?.accentColor || '#8B5CF6';
  const surfaceBgColor = resolvedCustomisation?.backgroundColor || '#090712';
  const surfaceOpacity = resolvedCustomisation ? (resolvedCustomisation.cardOpacity ?? 92) / 100 : 1;
  const layoutVariant = resolvedCustomisation?.layoutVariant || 'classic';

  const avatarFrameClass =
    resolvedCustomisation?.avatarFrameId === 'frame_sovereign_crest'
      ? 'bg-gradient-to-tr from-[#F59E0B] via-[#FDE68A] to-[#8B5CF6] shadow-[0_12px_40px_rgba(245,158,11,0.35)]'
      : resolvedCustomisation?.avatarFrameId === 'frame_prism_bevel'
      ? 'bg-gradient-to-tr from-[#8B5CF6] via-[#EC4899] to-[#06B6D4] shadow-[0_12px_40px_rgba(236,72,153,0.35)]'
      : resolvedCustomisation?.avatarFrameId === 'frame_violet_halo'
      ? 'bg-gradient-to-tr from-[#7C3AED] via-[#A855F7] to-[#C084FC] shadow-[0_12px_42px_rgba(168,85,247,0.5)]'
      : 'bg-gradient-to-tr from-[#6D28D9] via-[#8B5CF6] to-[#C084FC] shadow-[0_12px_40px_rgba(124,58,237,0.4)]';

  const avatarOrbitClass =
    resolvedCustomisation?.animatedDecorationId === 'anim_pulse_aura'
      ? 'after:content-[""] after:absolute after:-inset-2 after:rounded-full after:border after:border-[#A855F7]/65 after:animate-pulse after:pointer-events-none'
      : resolvedCustomisation?.animatedDecorationId === 'anim_prism_orbit'
      ? 'after:content-[""] after:absolute after:-inset-2 after:rounded-full after:border-2 after:border-dashed after:border-[#C084FC]/75 after:animate-[spin_8s_linear_infinite] after:pointer-events-none'
      : resolvedCustomisation?.animatedDecorationId === 'anim_stardust_halo'
      ? 'after:content-[""] after:absolute after:-inset-2 after:rounded-full after:border-2 after:border-dotted after:border-amber-400/80 after:animate-[spin_10s_linear_infinite] after:pointer-events-none'
      : '';

  const canSwitchOwnPresence = isOwnProfile && Boolean(myRole && myRole.active);
  const publicAdminStatus = getAdminEffectiveStatus(activeProfile.uid);
  const viewedAdminBadgeStatus = canSwitchOwnPresence
    ? myAdminSelfStatus
    : publicAdminStatus && publicAdminStatus !== 'offline'
    ? publicAdminStatus
    : null;

  const isBlocked = (privateInfo?.blockedUserIds || []).includes(activeProfile.uid);
  const isOfficialAccount = isUserOfficialOwner(activeProfile.uid, activeProfile);
  const isViewerPlatformVerified = isUserPlatformVerified(currentUser.uid, currentUser);
  const postUsersDirectory = users.length > 0 ? users : [activeProfile];
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

  const openEditProfileModal = () => {
    setEditName(currentUser.displayName);
    setEditUsername(currentUser.username);
    setEditBio(currentUser.bio || '');
    setEditWebsite(currentUser.website || '');
    setEditLocation(currentUser.location || '');
    setEditAvatar(currentUser.avatarUrl?.trim() || primaryAvatarUrl);
    setEditInterests(currentUser.interests || []);
    setNewInterest('');
    setEditError('');
    setShowEditProfile(true);
  };

  const handleQuickAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingQuickAvatar(true);
    try {
      const res = await uploadMediaAsset(file, `users/${currentUser.uid}/avatar`, ['image']);
      await updateUserProfileFields(currentUser.uid, { avatarUrl: res.url });
      setAvatarLoadError(false);
      await refreshUserAndProfile(false);
    } catch (err) {
      setShareToast(extractReadableErrorMessage(err, 'Unable to upload profile photo.'));
      setTimeout(() => setShareToast(''), 3000);
    } finally {
      setUploadingQuickAvatar(false);
      e.target.value = '';
    }
  };

  const handleModalAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditError('');
    setUploadingModalAvatar(true);
    try {
      const res = await uploadMediaAsset(file, `users/${currentUser.uid}/avatar`, ['image']);
      setEditAvatar(res.url);
    } catch (err) {
      setEditError(extractReadableErrorMessage(err, 'Unable to upload profile photo.'));
    } finally {
      setUploadingModalAvatar(false);
      e.target.value = '';
    }
  };

  const handleAddInterest = () => {
    const clean = newInterest.trim().slice(0, 40);
    if (!clean || editInterests.length >= 10) return;
    if (!editInterests.includes(clean)) {
      setEditInterests((prev) => [...prev, clean]);
    }
    setNewInterest('');
  };

  const handleSaveProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingModalAvatar || savingEdit) return;
    setEditError('');
    const cleanName = editName.trim();
    if (!cleanName) {
      setEditError('Full name cannot be empty.');
      return;
    }
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

      const updates: Parameters<typeof updateUserProfileFields>[1] = {};
      if (cleanName !== currentUser.displayName) updates.displayName = cleanName;
      if (normalized !== currentUser.username) updates.username = normalized;
      if (editBio !== (currentUser.bio || '')) updates.bio = editBio;
      if (editWebsite !== (currentUser.website || '')) updates.website = editWebsite;
      if (editLocation !== (currentUser.location || '')) updates.location = editLocation;

      const currentAvatarResolved = currentUser.avatarUrl?.trim() || primaryAvatarUrl;
      if (editAvatar && editAvatar !== currentAvatarResolved) {
        updates.avatarUrl = editAvatar;
      }

      const existingInterests = currentUser.interests || [];
      if (
        editInterests.length !== existingInterests.length ||
        editInterests.some((item, idx) => item !== existingInterests[idx])
      ) {
        updates.interests = editInterests;
      }

      if (Object.keys(updates).length > 0) {
        await updateUserProfileFields(currentUser.uid, updates, currentUser.username);
        setAvatarLoadError(false);
        await refreshUserAndProfile(false);
      }
      setShowEditProfile(false);
    } catch (err) {
      setEditError(extractReadableErrorMessage(err, 'Unable to save profile updates.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!privateInfo) return;
    try {
      const nextBlocked = isBlocked
        ? privateInfo.blockedUserIds.filter((id) => id !== activeProfile.uid)
        : [...privateInfo.blockedUserIds, activeProfile.uid];
      await updateUserPrivacySettings(currentUser.uid, privateInfo.privacySettings, nextBlocked);
      await refreshUserAndProfile(false);
    } catch (err) {
      setShareToast(extractReadableErrorMessage(err, 'Unable to update block setting.'));
      setTimeout(() => setShareToast(''), 3000);
    }
  };

  return (
    <div className="w-full space-y-8">
      {/* 1. COVER BANNER + 2. LEFT OVERLAPPING AVATAR + 3/4/5. RIGHT PROFILE COLUMN */}
      <section
        className={`w-full relative rounded-3xl overflow-hidden transition-all ${
          resolvedCustomisation ? 'p-3 sm:p-5 border' : ''
        }`}
        style={
          resolvedCustomisation
            ? {
                backgroundColor: surfaceBgColor,
                backgroundImage: gradientStyle,
                borderColor: `${accentColor}40`,
                opacity: surfaceOpacity,
              }
            : undefined
        }
      >
        {resolvedCustomisation && <ProfileEffectLayer effectId={resolvedCustomisation.effectId} />}

        {/* 1. Large Horizontal Cover Banner with Rounded Corners */}
        <div
          className={`relative w-full rounded-3xl overflow-hidden border bg-[#0D0B16] shadow-[0_20px_50px_rgba(0,0,0,0.6)] ${
            layoutVariant === 'compact'
              ? 'h-44 sm:h-52 lg:h-56'
              : layoutVariant === 'spotlight' || layoutVariant === 'showcase'
              ? 'h-60 sm:h-72 lg:h-80'
              : 'h-56 sm:h-64 lg:h-76'
          }`}
          style={{
            borderColor: `${accentColor}38`,
            backgroundImage: bannerBg.cssBackground,
          }}
        >
          {resolvedCustomisation?.bannerImageUrl ? (
            <ResilientImage
              src={resolvedCustomisation.bannerImageUrl}
              alt={`${activeProfile.displayName} studio banner`}
              className="w-full h-full object-cover"
            />
          ) : !resolvedCustomisation?.bannerPresetId ||
            resolvedCustomisation.bannerPresetId === 'banner_obsidian_grid' ? (
            <ResilientImage
              src={activeProfile.coverUrl}
              alt={`${activeProfile.displayName} cover banner`}
              style={{ objectPosition: `50% ${activeProfile.coverPositionY ?? 50}%` }}
              className="w-full h-full object-cover"
            />
          ) : null}
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
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-[46%_54%] gap-6 md:gap-0 px-4 sm:px-8 lg:px-10 pt-2">
          {/* 2. LEFT-HAND SIDE: Large Circular Overlapping Profile Picture */}
          <div className="flex justify-start items-start">
            <div className="-mt-16 sm:-mt-20 lg:-mt-28 md:ml-4 lg:ml-10 relative z-20 shrink-0">
              <div className={`relative rounded-full ${avatarOrbitClass}`}>
                <div className={`w-32 h-32 sm:w-40 sm:h-40 lg:w-48 lg:h-48 rounded-full p-[3px] ${avatarFrameClass}`}>
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

                {resolvedCustomisation?.staticDecorationId === 'deco_spark_crest' && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 right-3 w-8 h-8 rounded-full bg-[#120F1E] border border-[#A855F7]/70 flex items-center justify-center text-[#C084FC] shadow-lg"
                  >
                    <Sparkles size={15} />
                  </span>
                )}
                {resolvedCustomisation?.staticDecorationId === 'deco_botanical_arc' && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 right-3 w-8 h-8 rounded-full bg-[#120F1E] border border-sky-400/70 flex items-center justify-center text-sky-300 shadow-lg"
                  >
                    <Sparkles size={15} />
                  </span>
                )}
                {resolvedCustomisation?.staticDecorationId === 'deco_crown_pin' && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 right-3 w-8 h-8 rounded-full bg-[#181209] border border-amber-400/75 flex items-center justify-center text-amber-300 shadow-lg"
                  >
                    <Sparkles size={15} />
                  </span>
                )}
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
                    className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-[#0D0B16] hover:bg-[#7C3AED] border border-[#8B5CF6]/50 text-white flex items-center justify-center shadow-lg transition-colors z-10"
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
            <div className="w-full max-w-[460px] space-y-4">
              {/* 3. Profile Information */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-display text-2xl lg:text-3xl font-bold text-white tracking-tight">
                    {activeProfile.displayName}
                  </h1>
                  <BadgeStrip badges={activeBadges} size={20} max={6} />
                  {isOfficialAccount && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#7C3AED]/25 border border-[#A855F7]/50 text-[11px] font-semibold text-[#E9D5FF]">
                      <ShieldCheck size={13} className="text-[#C084FC]" />
                      Official Nexora
                    </span>
                  )}
                  <TierBadge tier={activeTier} showFree={false} />
                  {viewedAdminBadgeStatus && (
                    <PresenceBadge
                      status={viewedAdminBadgeStatus}
                      size="md"
                      showOffline={canSwitchOwnPresence}
                      showLabel
                    />
                  )}
                </div>

                <p className="text-sm font-medium" style={{ color: accentColor }}>
                  @{activeProfile.username}
                </p>

                {isOfficialAccount && (
                  <div className="p-3 rounded-xl bg-[#140F24]/95 border border-[#A855F7]/35 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#E9D5FF]">
                        <ShieldCheck size={14} className="text-[#C084FC]" />
                        {activeProfile.officialTitle || 'Official Nexora Account'}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-[#C084FC]">
                        {formatCompactCount(activeProfile.followersCount)} followers ·{' '}
                        {formatCompactCount(totalLikesReceived)} likes
                      </span>
                    </div>
                    <p className="text-[11px] text-[#CBD5E1] leading-relaxed">
                      Everyone on Nexora can follow this official account and like its updates. Only platform-verified members can submit comments on official posts.
                    </p>
                    {!isOwnProfile && !isViewerPlatformVerified && onOpenVerification && (
                      <button
                        type="button"
                        onClick={onOpenVerification}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#C084FC] hover:text-white underline underline-offset-2"
                      >
                        <ShieldCheck size={12} /> Apply for Verification to Comment
                      </button>
                    )}
                  </div>
                )}

                {activeProfile.bio && (
                  <p className="text-sm text-[#E2E8F0] leading-relaxed pt-1.5 break-words">
                    {activeProfile.bio}
                  </p>
                )}

                {(activeProfile.location || activeProfile.website) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-[#94A3B8]">
                    {activeProfile.location && (
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin size={13} style={{ color: accentColor }} />
                        {activeProfile.location}
                      </span>
                    )}
                    {activeProfile.website && (
                      <a
                        href={
                          /^https?:\/\//i.test(activeProfile.website)
                            ? activeProfile.website
                            : `https://${activeProfile.website.replace(/^[a-z]+:/i, '')}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 hover:underline break-all"
                        style={{ color: accentColor }}
                      >
                        <Globe size={13} />
                        {activeProfile.website}
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Compact Statistics Panel */}
              <div
                className={`w-full grid grid-cols-4 divide-x divide-white/10 rounded-2xl bg-[#0D0B16]/90 border py-2.5 px-1 ${
                  layoutVariant === 'showcase' ? 'shadow-[0_12px_30px_rgba(124,58,237,0.2)]' : ''
                }`}
                style={{ borderColor: `${accentColor}38` }}
              >
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

              {/* 5. Profile Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                {isOwnProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={openEditProfileModal}
                      className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.4)] transition-all whitespace-nowrap min-h-[42px]"
                    >
                      <Edit3 size={14} /> Edit Profile
                    </button>
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('studio')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#8B5CF6]/35 bg-[#0D0B16]/90 hover:border-[#8B5CF6] text-xs font-semibold text-[#E9D5FF] transition-colors whitespace-nowrap min-h-[42px]"
                      >
                        <Palette size={14} className="text-[#C084FC]" /> Customise Studio
                      </button>
                    )}
                    {onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('analytics')}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 bg-[#0D0B16]/90 hover:border-[#8B5CF6]/60 text-xs font-semibold text-white transition-colors whitespace-nowrap min-h-[42px]"
                      >
                        <BarChart3 size={14} className="text-[#C084FC]" /> Analytics
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleShareProfile}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#8B5CF6]/25 bg-[#0D0B16]/90 hover:border-[#8B5CF6]/60 text-xs font-semibold text-white transition-colors whitespace-nowrap min-h-[42px]"
                    >
                      <Share2 size={14} /> Share
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={followLoading || followBusy}
                      onClick={async () => {
                        if (followLoading || followBusy) return;
                        setFollowBusy(true);
                        try {
                          const next = await toggleFollowUser(
                            currentUser,
                            activeProfile,
                            isFollowing
                          );
                          setIsFollowing(next);
                          const fresh = await getUserProfile(activeProfile.uid);
                          if (fresh) setViewedProfile(fresh);
                          await refreshUserAndProfile(false);
                        } catch (err) {
                          setShareToast(extractReadableErrorMessage(err, 'Unable to update follow status.'));
                          setTimeout(() => setShareToast(''), 4000);
                        } finally {
                          setFollowBusy(false);
                        }
                      }}
                      className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                        isFollowing
                          ? 'bg-white/10 hover:bg-white/20 text-white'
                          : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]'
                      }`}
                    >
                      {followLoading ? 'Loading...' : followBusy ? 'Updating...' : isFollowing ? 'Following' : 'Follow'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const convId = await createOrGetDirectConversation(
                            currentUser,
                            activeProfile
                          );
                          onOpenChatThread(convId);
                        } catch (err) {
                          setShareToast(extractReadableErrorMessage(err, 'Unable to open chat thread.'));
                          setTimeout(() => setShareToast(''), 3000);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#8B5CF6]/25 bg-[#0D0B16] hover:border-[#8B5CF6]/60 text-xs font-semibold text-white"
                    >
                      <MessageSquare size={14} /> Message
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowGiftModal(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#7C3AED]/20 to-[#EC4899]/20 border border-[#8B5CF6]/40 hover:border-[#A855F7] text-xs font-semibold text-white"
                    >
                      <Gift size={14} className="text-pink-300" /> Send Gift
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

              {canSwitchOwnPresence && (
                <div className="rounded-2xl bg-[#0D0B16]/90 border border-[#8B5CF6]/25 p-3.5">
                  <AdminPresenceSelector
                    currentMode={myAdminManualMode}
                    effectiveStatus={myAdminSelfStatus}
                    busy={presenceBusy}
                    compact
                    onChange={async (mode) => {
                      setPresenceBusy(true);
                      try {
                        await setMyAdminStatus(mode);
                      } catch (err) {
                        setShareToast(extractReadableErrorMessage(err, 'Unable to update status.'));
                        setTimeout(() => setShareToast(''), 3000);
                      } finally {
                        setPresenceBusy(false);
                      }
                    }}
                  />
                </div>
              )}

              {shareToast && (
                <p className="inline-flex items-center gap-1.5 text-xs text-[#C084FC]">
                  <Check size={13} /> {shareToast}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Own-Profile Compact Tasks, Wallet & Invitation Strip */}
      {isOwnProfile && (
        <section className="rounded-2xl bg-gradient-to-r from-[#0F0C1D] via-[#130E24] to-[#0B111A] border border-[#8B5CF6]/25 p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Award size={15} className="text-amber-300" />
              </div>
              <div>
                <p className="text-[11px] text-[#94A3B8]">Earn Free Key Points</p>
                <p className="text-xs sm:text-sm font-semibold text-white">
                  <span className="font-mono-tabular text-emerald-300">{wallet.availablePoints} KP</span>
                  <span className="text-[#64748B] mx-1.5">·</span>
                  <span className="font-mono-tabular text-[#CBD5E1]">
                    {activeFreeTasks.length} free task{activeFreeTasks.length === 1 ? '' : 's'}
                  </span>
                  {personalInvite && (
                    <>
                      <span className="text-[#64748B] mx-1.5">·</span>
                      <span className="font-mono-tabular text-[#C084FC]">
                        Invite: {personalInvite.code}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {personalInvite && (
              <button
                type="button"
                onClick={() => {
                  const url = buildReferralShareUrl(personalInvite.code);
                  void navigator.clipboard.writeText(url).then(() => {
                    setCopiedQuickInvite(true);
                    setShareToast('Referral link copied!');
                    setTimeout(() => {
                      setCopiedQuickInvite(false);
                      setShareToast('');
                    }, 2200);
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-[#E2E8F0] whitespace-nowrap min-h-[38px]"
              >
                {copiedQuickInvite ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedQuickInvite ? 'Link Copied' : 'Copy Invite Link'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setContentTab('tasks')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[38px] transition-colors ${
                contentTab === 'tasks'
                  ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-200'
                  : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
              }`}
            >
              <Gift size={13} />
              <span>{contentTab === 'tasks' ? 'Viewing Tasks & Earn' : 'Earn KP & Tasks'}</span>
            </button>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('wallet')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-[#CBD5E1] hover:text-white whitespace-nowrap min-h-[38px]"
              >
                <Wallet size={13} className="text-emerald-400" />
                <span>Wallet</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* 6. PROFILE CONTENT TABS: Posts | Videos | Photos | Tagged | Collabs | Gifts | Tasks & Earn | Spaces | Saved */}
      <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3.5 overflow-x-auto no-scrollbar">
        {[
          { id: 'posts', label: 'Posts', count: userPosts.length },
          { id: 'videos', label: 'Videos', count: videoPosts.length + userVibes.length },
          { id: 'photos', label: 'Photos', count: photoPosts.length },
          { id: 'tagged', label: 'Tagged', count: taggedPosts.length },
          { id: 'collabs', label: 'Collabs', count: collabPosts.length },
          { id: 'gifts', label: 'Gifts', count: receivedGifts.length },
          ...(isOwnProfile
            ? [{ id: 'tasks', label: 'Tasks & Earn', count: activeFreeTasks.length }]
            : []),
          { id: 'spaces', label: 'Spaces', count: userSpaces.length },
          ...(isOwnProfile
            ? [{ id: 'saved', label: 'Saved', count: savedPosts.length + savedVibes.length }]
            : []),
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setContentTab(tab.id as ProfileContentTab)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 min-h-[42px] ${
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
                onOpenVerification={onOpenVerification}
                usersDirectory={postUsersDirectory}
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

      {contentTab === 'tagged' && (
        taggedPosts.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
            <Tag size={24} className="mx-auto text-[#8B5CF6]" />
            <p className="text-sm font-medium text-white">No tagged posts yet</p>
            <p className="text-xs text-[#94A3B8]">
              Posts where @{activeProfile.username} is formally tagged will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {taggedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isSaved={savedPostIds.includes(post.id)}
                onOpenProfile={onOpenProfile}
                onOpenVerification={onOpenVerification}
                usersDirectory={postUsersDirectory}
              />
            ))}
          </div>
        )
      )}

      {contentTab === 'collabs' && (
        <div className="space-y-5">
          {isOwnProfile && pendingCollabInvites.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#150F29] border border-[#8B5CF6]/35 space-y-3">
              <p className="text-xs font-semibold text-[#E9D5FF] flex items-center gap-2">
                <UserPlus size={14} className="text-[#C084FC]" /> Pending Collaboration Invitations ({pendingCollabInvites.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pendingCollabInvites.map((inv) => (
                  <div key={inv.id} className="p-3.5 rounded-xl bg-[#0D0B16] border border-white/10 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">@{inv.authorUsername} invited you</p>
                      <p className="text-[11px] text-[#94A3B8] truncate">{inv.text || 'Media post'}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void respondToCollaborationInvite({
                            post: inv,
                            responder: currentUser,
                            decision: 'accept',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-[11px] font-semibold text-white"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void respondToCollaborationInvite({
                            post: inv,
                            responder: currentUser,
                            decision: 'decline',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-[#94A3B8]"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {collabPosts.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
              <UserPlus size={24} className="mx-auto text-[#8B5CF6]" />
              <p className="text-sm font-medium text-white">No collaborative posts yet</p>
              <p className="text-xs text-[#94A3B8]">
                Accepted post collaborations featuring @{activeProfile.username} appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {collabPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isSaved={savedPostIds.includes(post.id)}
                  onOpenProfile={onOpenProfile}
                  onOpenVerification={onOpenVerification}
                  usersDirectory={postUsersDirectory}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {contentTab === 'gifts' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Gift size={17} className="text-pink-300" /> Free Virtual Gifts Showcase
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Community appreciation tokens are 100% free on Nexora — no purchases or currency required.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono-tabular">
              {isOwnProfile ? (
                <div className="inline-flex items-center p-1 rounded-xl bg-[#08070F] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setGiftsViewTab('received')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      giftsViewTab === 'received'
                        ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Received ({receivedGifts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGiftsViewTab('sent')}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      giftsViewTab === 'sent'
                        ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    Sent ({sentGifts.length})
                  </button>
                </div>
              ) : (
                <>
                  <span className="px-3.5 py-2 rounded-xl bg-[#08070F] border border-white/10 text-white">
                    Received: <strong>{receivedGifts.length}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowGiftModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white min-h-[40px]"
                  >
                    <Sparkles size={13} /> Send Free Gift
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Gift Showcase Summary Pills */}
          {receivedGifts.length > 0 && (giftsViewTab === 'received' || !isOwnProfile) && (
            <div className="flex flex-wrap items-center gap-2">
              {Array.from(
                receivedGifts.reduce((map, g) => {
                  const key = `${g.giftEmoji}|${g.giftName}`;
                  map.set(key, (map.get(key) || 0) + 1);
                  return map;
                }, new Map<string, number>())
              ).map(([key, count]) => {
                const [emoji, name] = key.split('|');
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white"
                  >
                    <span>{emoji}</span>
                    <span className="font-medium">{name}</span>
                    <span className="font-mono-tabular text-[#C084FC]">×{count}</span>
                  </span>
                );
              })}
            </div>
          )}

          {isOwnProfile && giftsViewTab === 'sent' ? (
            sentGifts.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
                <Gift size={24} className="mx-auto text-[#8B5CF6]" />
                <p className="text-sm font-medium text-white">No gifts sent yet</p>
                <p className="text-xs text-[#94A3B8]">
                  Free virtual gifts you send to creators and posts appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sentGifts.map((g) => (
                  <div
                    key={g.id}
                    className="p-4 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border"
                          style={{
                            backgroundColor: `${g.giftAccent || '#A855F7'}1A`,
                            borderColor: `${g.giftAccent || '#A855F7'}4D`,
                          }}
                        >
                          {g.giftEmoji}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{g.giftName}</p>
                          <p className="text-[11px] text-[#94A3B8] truncate">
                            To{' '}
                            <button
                              type="button"
                              onClick={() => onOpenProfile(g.recipientUid)}
                              className="text-[#C084FC] hover:underline font-medium"
                            >
                              @{g.recipientUsername}
                            </button>
                            {g.anonymous ? ' (sent anonymously)' : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#64748B] font-mono-tabular shrink-0">
                        {formatRelativeTime(g.createdAt)}
                      </span>
                    </div>
                    {g.message && (
                      <p className="text-xs text-[#E2E8F0] bg-[#08070F] p-2.5 rounded-xl border border-white/[0.06]">
                        &ldquo;{g.message}&rdquo;
                      </p>
                    )}
                    <p className="text-[10px] uppercase tracking-wider text-[#64748B]">
                      {g.targetType === 'post' ? 'Sent on a Post' : 'Sent on Profile'} · Free Token
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : receivedGifts.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
              <Gift size={24} className="mx-auto text-[#8B5CF6]" />
              <p className="text-sm font-medium text-white">No gifts received yet</p>
              <p className="text-xs text-[#94A3B8]">
                Free appreciation tokens sent by the community appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {receivedGifts.map((g) => (
                <div
                  key={g.id}
                  className="p-4 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border"
                        style={{
                          backgroundColor: `${g.giftAccent || '#A855F7'}1A`,
                          borderColor: `${g.giftAccent || '#A855F7'}4D`,
                        }}
                      >
                        {g.giftEmoji}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{g.giftName}</p>
                        <p className="text-[11px] text-[#94A3B8] truncate">
                          From{' '}
                          {g.anonymous ? (
                            'Anonymous Supporter'
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenProfile(g.senderUid)}
                              className="text-[#C084FC] hover:underline font-medium"
                            >
                              {g.senderUsername ? `@${g.senderUsername}` : g.senderName}
                            </button>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#64748B] font-mono-tabular shrink-0">
                      {formatRelativeTime(g.createdAt)}
                    </span>
                  </div>
                  {g.message && (
                    <p className="text-xs text-[#E2E8F0] bg-[#08070F] p-2.5 rounded-xl border border-white/[0.06]">
                      &ldquo;{g.message}&rdquo;
                    </p>
                  )}
                  <p className="text-[10px] uppercase tracking-wider text-[#64748B]">
                    {g.targetType === 'post' ? 'Appreciated a Post' : 'Profile Gift'} · 100% Free
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {contentTab === 'tasks' && isOwnProfile && currentUser && (
        <ProfileTasksPanel
          profile={currentUser}
          tasks={tasks}
          submissions={taskSubmissions}
          wallet={wallet}
          rewardsConfig={rewardsConfig}
          invitations={myInvitations}
          referralClaims={myReferralClaims}
          postsCount={userPosts.length}
          followingCount={currentUser.followingCount}
          joinedSpacesCount={userSpaces.length}
          onEditProfile={() => setShowEditProfile(true)}
          onNavigate={onNavigate}
          onNotify={(msg) => {
            setShareToast(msg);
            setTimeout(() => setShareToast(''), 2500);
          }}
        />
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
                    onOpenVerification={onOpenVerification}
                    usersDirectory={postUsersDirectory}
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

      {!isOwnProfile && (
        <GiftPickerModal
          open={showGiftModal}
          onClose={() => setShowGiftModal(false)}
          recipient={{
            uid: activeProfile.uid,
            displayName: activeProfile.displayName,
            username: activeProfile.username,
          }}
          targetType="profile"
          targetId={activeProfile.uid}
          onSent={(giftName) => {
            setShareToast(`Sent free ${giftName} to @${activeProfile.username}`);
            setTimeout(() => setShareToast(''), 2800);
          }}
        />
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
            await refreshUserAndProfile(false);
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
                      src={resolveAssetUrl(editAvatar)}
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
                  disabled={uploadingModalAvatar}
                  onClick={() => modalAvatarInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white disabled:opacity-50"
                >
                  <Camera size={14} /> {uploadingModalAvatar ? 'Uploading...' : 'Change Profile Photo'}
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
                disabled={savingEdit || uploadingModalAvatar}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] disabled:opacity-50 text-xs font-semibold text-white"
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
