import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  Compass,
  Edit3,
  FolderPlus,
  Layers,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Search,
  Send,
  Shield,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { PresenceBadge } from '../../components/common/PresenceBadge';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip, VerifiedBadge } from '../../components/common/VerifiedBadge';
import { CoverEditorModal } from '../../components/media/CoverEditorModal';
import { PostComposer } from '../../features/posts/PostComposer';
import { PostCard } from '../../features/posts/PostCard';
import { useAuth } from '../../hooks/useAuth';
import {
  createSpace,
  createSpaceEvent,
  markNotificationRead,
  removeSpaceMember,
  sendSpaceDiscussion,
  sendSpaceInviteNotification,
  subscribeFeedPosts,
  subscribeMySpaceMembership,
  subscribeSpaceDiscussions,
  subscribeSpaceEvents,
  subscribeSpaceMembers,
  toggleSpaceMembership,
  updateSpaceCover,
  updateSpaceMemberRole,
} from '../../services/firebase/socialService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { uploadMediaAsset } from '../../services/storage/mediaUploadService';
import {
  NotificationItem,
  Post,
  Space,
  SpaceDiscussion,
  SpaceEvent,
  SpaceMember,
  UserProfile,
} from '../../types/nexora';
import {
  formatCompactCount,
  formatRelativeTime,
  hasAdminPermission,
} from '../../utils/validation';

interface SpacesPageProps {
  spaces: Space[];
  users: UserProfile[];
  notifications: NotificationItem[];
  savedPostIds: string[];
  initialSpaceId?: string | null;
  onOpenProfile: (uid: string) => void;
}

const PRIMARY_CATEGORIES = ['All', 'Faith', 'Business', 'Finance', 'Lifestyle', 'Education'];
const EXTRA_CATEGORIES = ['Design', 'Technology', 'Music & Audio', 'Filmmaking', 'Photography'];

const DEFAULT_COVERS = [
  '/src/assets/images/space_cover_business_1795069803165.jpg',
  '/src/assets/images/space_cover_lifestyle_1795069803396.jpg',
  '/src/assets/images/space_cover_education_1795069803375.jpg',
  '/src/assets/images/space_cover_design_1795066814901.jpg',
  '/src/assets/images/space_cover_sound_1795066815582.jpg',
  '/src/assets/images/space_cover_code_1795066815138.jpg',
];

export function SpacesPage({
  spaces,
  users,
  notifications,
  savedPostIds,
  initialSpaceId,
  onOpenProfile,
}: SpacesPageProps) {
  const { profile, myRole, platformConfig, getUserBadges, getAdminEffectiveStatus } = useAuth();
  const [sidebarTab, setSidebarTab] = useState<'discover' | 'mine' | 'invites' | 'joined' | 'create'>('discover');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(initialSpaceId || null);
  const [spaceInnerTab, setSpaceInnerTab] = useState<
    'posts' | 'discussions' | 'members' | 'events' | 'voice' | 'moderation'
  >('posts');

  // Create Space form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Business');
  const [coverUrl, setCoverUrl] = useState(DEFAULT_COVERS[0]);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const createCoverFileRef = useRef<HTMLInputElement>(null);

  // Inside Space state
  const [membershipsMap, setMembershipsMap] = useState<Record<string, boolean>>({});
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [spacePosts, setSpacePosts] = useState<Post[]>([]);
  const [discussions, setDiscussions] = useState<SpaceDiscussion[]>([]);
  const [discussionInput, setDiscussionInput] = useState('');
  const [events, setEvents] = useState<SpaceEvent[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventDate, setEventDate] = useState('');

  // Invite Members Modal inside Space
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitedUids, setInvitedUids] = useState<string[]>([]);

  // Voice Room state
  const [inVoiceRoom, setInVoiceRoom] = useState(false);
  const [micMuted, setMicMuted] = useState(false);

  // Cover Editor Modal
  const [editingCover, setEditingCover] = useState(false);

  useEffect(() => {
    if (initialSpaceId) setActiveSpaceId(initialSpaceId);
  }, [initialSpaceId]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;

  useEffect(() => {
    if (!profile || spaces.length === 0) return;
    const unsubs = spaces.map((s) =>
      subscribeMySpaceMembership(s.id, profile.uid, (joined) => {
        setMembershipsMap((prev) => (prev[s.id] === joined ? prev : { ...prev, [s.id]: joined }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [spaces, profile?.uid]);

  useEffect(() => {
    if (!activeSpace) return;
    const u1 = subscribeSpaceMembers(activeSpace.id, setSpaceMembers);
    const u2 = subscribeFeedPosts(setSpacePosts, activeSpace.id);
    const u3 = subscribeSpaceDiscussions(activeSpace.id, setDiscussions);
    const u4 = subscribeSpaceEvents(activeSpace.id, setEvents);
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [activeSpace?.id]);

  const spaceInvites = useMemo(
    () => notifications.filter((n) => n.type === 'space_invite'),
    [notifications]
  );

  if (!profile) return null;

  const isMemberOfActive = activeSpace ? Boolean(membershipsMap[activeSpace.id]) : false;
  const myMemberRecord = spaceMembers.find((m) => m.uid === profile.uid);
  const canModerate =
    activeSpace?.ownerId === profile.uid || myMemberRecord?.role === 'admin';

  const handleUploadCreateCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      const res = await uploadMediaAsset(file, `spaces/drafts/${profile.uid}`, ['image']);
      setCoverUrl(res.url);
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'We couldn’t upload your image. Please try again.'));
    } finally {
      setUploadingCover(false);
    }
  };

  const canManageAllCommunities = hasAdminPermission(myRole, 'manage_communities');

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const requiresApproval =
        Boolean(platformConfig.features.communityApprovalRequired) && !canManageAllCommunities;
      const id = await createSpace({
        owner: profile,
        name,
        description,
        category,
        coverUrl,
        isPrivate,
        initialStatus: requiresApproval ? 'pending' : 'active',
      });
      setName('');
      setDescription('');
      setSidebarTab('discover');
      setActiveSpaceId(id);
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'Unable to create Space right now. Please try again.'));
    } finally {
      setCreating(false);
    }
  };

  const filteredSpaces = spaces.filter((s) => {
    if (s.status === 'suspended' && !canManageAllCommunities) return false;
    if (s.status === 'pending' && s.ownerId !== profile.uid && !canManageAllCommunities) {
      return false;
    }
    if (sidebarTab === 'mine' && s.ownerId !== profile.uid) return false;
    if (sidebarTab === 'joined' && !membershipsMap[s.id]) return false;
    if (selectedCategory !== 'All' && s.category !== selectedCategory) return false;
    if (
      searchQuery.trim() &&
      !s.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !s.description.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  // Dedicated Space Detail Interior View (Non-Discord clean editorial layout)
  if (activeSpace) {
    const nonMembers = users.filter(
      (u) => u.uid !== profile.uid && !spaceMembers.some((m) => m.uid === u.uid)
    );
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            setActiveSpaceId(null);
            setInVoiceRoom(false);
          }}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#94A3B8] hover:text-white"
        >
          <ArrowLeft size={15} /> Back to Explore Spaces
        </button>

        <div className="relative rounded-3xl overflow-hidden border border-[#8B5CF6]/25 min-h-[220px] sm:aspect-[16/5]">
          <ResilientImage
            src={activeSpace.coverUrl}
            alt={activeSpace.name}
            style={{ objectPosition: `50% ${activeSpace.coverPositionY ?? 50}%` }}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/25 p-4 sm:p-6 lg:p-9 flex flex-col justify-end">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <p className="text-xs font-medium text-[#C084FC]">
                  {activeSpace.category}
                  {activeSpace.isPrivate ? ' · Private Space' : ' · Open Space'}
                </p>
                <h1 className="font-display text-2xl lg:text-4xl font-bold text-white inline-flex items-center gap-2">
                  {activeSpace.name}
                  {activeSpace.verified && <VerifiedBadge size={22} />}
                </h1>
                <p className="text-sm text-[#E2E8F0]">{activeSpace.description}</p>
                <p className="text-xs text-[#CBD5E1] font-mono-tabular">
                  Owner @{activeSpace.ownerUsername} · Created{' '}
                  {activeSpace.createdAt?.toDate
                    ? activeSpace.createdAt.toDate().toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '2026'}{' '}
                  · {formatCompactCount(activeSpace.membersCount)} members
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {canModerate && (
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-white"
                  >
                    <UserPlus size={14} /> Invite Members
                  </button>
                )}
                {activeSpace.ownerId === profile.uid ? (
                  <button
                    type="button"
                    onClick={() => setEditingCover(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-black/65 border border-white/20 text-xs font-medium text-white hover:bg-black/85"
                  >
                    <Edit3 size={13} /> Edit Cover
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void toggleSpaceMembership(activeSpace, profile, isMemberOfActive)
                    }
                    className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isMemberOfActive
                        ? 'bg-white/15 hover:bg-white/25 text-white'
                        : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                    }`}
                  >
                    {isMemberOfActive ? 'Joined' : 'Join Space'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Inner Space Navigation */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/[0.08] pb-3.5">
          {[
            { id: 'posts', label: 'Community Posts' },
            { id: 'discussions', label: 'Discussions' },
            { id: 'members', label: `Members (${spaceMembers.length})` },
            { id: 'events', label: `Events (${events.length})` },
            { id: 'voice', label: 'Audio Lounge' },
            ...(canModerate ? [{ id: 'moderation', label: 'Roles & Moderation' }] : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSpaceInnerTab(item.id as typeof spaceInnerTab)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                spaceInnerTab === item.id
                  ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                  : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {spaceInnerTab === 'posts' && (
          <div className="max-w-3xl space-y-5">
            {isMemberOfActive && (
              <PostComposer spaces={spaces} users={users} defaultSpaceId={activeSpace.id} />
            )}
            {spacePosts.length === 0 ? (
              <p className="text-xs text-[#64748B] py-6">
                No community posts in {activeSpace.name} yet.
              </p>
            ) : (
              spacePosts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  isSaved={savedPostIds.includes(p.id)}
                  onOpenProfile={onOpenProfile}
                />
              ))
            )}
          </div>
        )}

        {spaceInnerTab === 'discussions' && (
          <div className="max-w-3xl rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 overflow-hidden">
            {!isMemberOfActive ? (
              <div className="p-10 text-center space-y-3">
                <MessageSquare size={22} className="mx-auto text-[#A855F7]" />
                <p className="text-sm text-white font-semibold">Join this Space to participate</p>
                <button
                  type="button"
                  onClick={() => void toggleSpaceMembership(activeSpace, profile, false)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
                >
                  Join Space
                </button>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-3 max-h-[440px] overflow-y-auto">
                  {discussions.length === 0 ? (
                    <p className="text-xs text-[#64748B]">
                      Start a community discussion thread below.
                    </p>
                  ) : (
                    discussions.map((d) => {
                      const adminStatus = getAdminEffectiveStatus(d.authorId);
                      const badgeStatus = adminStatus && adminStatus !== 'offline' ? adminStatus : null;
                      return (
                        <div key={d.id} className="flex items-start gap-3">
                          <div className="relative shrink-0">
                            <ResilientImage
                              src={d.authorAvatar}
                              alt={d.authorName}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                            {badgeStatus && (
                              <span className="absolute -bottom-0.5 -right-0.5">
                                <PresenceBadge status={badgeStatus} size="xs" />
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <span className="font-semibold text-white inline-flex items-center gap-1">
                                {d.authorName}
                                <BadgeStrip badges={getUserBadges(d.authorId)} size={12} max={2} />
                                {badgeStatus && <PresenceBadge status={badgeStatus} size="xs" />}
                              </span>
                              <span className="text-[#64748B]">
                                {formatRelativeTime(d.createdAt)}
                              </span>
                            </div>
                            <p className="text-sm text-[#CBD5E1] break-words">{d.text}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!discussionInput.trim()) return;
                    await sendSpaceDiscussion({
                      spaceId: activeSpace.id,
                      author: profile,
                      text: discussionInput,
                      channel: 'general',
                    });
                    setDiscussionInput('');
                  }}
                  className="p-4 border-t border-white/10 flex gap-2"
                >
                  <input
                    type="text"
                    value={discussionInput}
                    onChange={(e) => setDiscussionInput(e.target.value)}
                    placeholder={`Message ${activeSpace.name} discussion...`}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-sm text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white"
                    aria-label="Send discussion message"
                  >
                    <Send size={15} />
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {spaceInnerTab === 'members' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaceMembers.map((m) => {
              const adminStatus = getAdminEffectiveStatus(m.uid);
              const badgeStatus = adminStatus && adminStatus !== 'offline' ? adminStatus : null;
              return (
                <div
                  key={m.uid}
                  className="p-4 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(m.uid)}
                    className="flex items-center gap-3 text-left min-w-0"
                  >
                    <div className="relative shrink-0">
                      <ResilientImage
                        src={m.avatarUrl}
                        alt={m.displayName}
                        className="w-11 h-11 rounded-full object-cover"
                      />
                      {badgeStatus && (
                        <span className="absolute -bottom-0.5 -right-0.5">
                          <PresenceBadge status={badgeStatus} size="xs" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1 max-w-full">
                        <span className="truncate">{m.displayName}</span>
                        <BadgeStrip badges={getUserBadges(m.uid)} size={12} max={2} interactive={false} />
                        {badgeStatus && <PresenceBadge status={badgeStatus} size="xs" />}
                      </p>
                      <p className="text-[11px] text-[#94A3B8] truncate">
                        @{m.username} · {m.role}
                      </p>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {spaceInnerTab === 'events' && (
          <div className="space-y-4 max-w-3xl">
            {isMemberOfActive && (
              <button
                type="button"
                onClick={() => setShowEventModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                <Calendar size={14} /> Schedule Event
              </button>
            )}
            {events.length === 0 ? (
              <p className="text-xs text-[#64748B]">No events scheduled yet.</p>
            ) : (
              events.map((ev) => (
                <div
                  key={ev.id}
                  className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold text-white">{ev.title}</h3>
                    <span className="font-mono-tabular text-xs text-[#C084FC]">
                      {ev.scheduledFor}
                    </span>
                  </div>
                  <p className="text-xs text-[#94A3B8]">{ev.description}</p>
                  <p className="text-[11px] text-[#64748B]">Hosted by {ev.hostName}</p>
                </div>
              ))
            )}
          </div>
        )}

        {spaceInnerTab === 'voice' && (
          <div className="max-w-2xl p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-5">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <Volume2 size={18} className="text-[#A855F7]" /> Live Audio Stage
                </h3>
                <p className="text-xs text-[#94A3B8]">
                  Drop-in voice conversation for {activeSpace.name} members.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInVoiceRoom((v) => !v)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${
                  inVoiceRoom
                    ? 'bg-rose-600 text-white'
                    : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                }`}
              >
                {inVoiceRoom ? 'Leave Audio Lounge' : 'Join Audio Lounge'}
              </button>
            </div>

            {inVoiceRoom && (
              <div className="p-4 rounded-xl bg-[#06060A] border border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ResilientImage
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-[#8B5CF6]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-white">{profile.displayName}</p>
                    <p className="text-[11px] text-[#A855F7]">
                      {micMuted ? 'Microphone muted' : 'Connected on stage'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMicMuted((m) => !m)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-white"
                >
                  {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
                  {micMuted ? 'Unmute' : 'Mute'}
                </button>
              </div>
            )}
          </div>
        )}

        {spaceInnerTab === 'moderation' && canModerate && (
          <div className="max-w-3xl p-6 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-4">
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Shield size={17} className="text-[#A855F7]" /> Roles & Member Moderation
            </h3>
            <div className="divide-y divide-white/[0.06]">
              {spaceMembers.map((m) => (
                <div key={m.uid} className="py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-white">{m.displayName}</p>
                    <p className="text-[11px] text-[#94A3B8]">
                      @{m.username} · {m.role}
                    </p>
                  </div>
                  {m.uid !== activeSpace.ownerId && activeSpace.ownerId === profile.uid && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void updateSpaceMemberRole(
                            activeSpace.id,
                            m.uid,
                            m.role === 'admin' ? 'member' : 'admin'
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white"
                      >
                        {m.role === 'admin' ? 'Demote to Member' : 'Promote to Admin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSpaceMember(activeSpace, m.uid)}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-xs text-rose-300"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite Members Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0D0B16] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-white">
                  Invite to {activeSpace.name}
                </h3>
                <button type="button" onClick={() => setShowInviteModal(false)}>
                  <X size={18} className="text-[#94A3B8]" />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2">
                {nonMembers.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">
                    All directory users are already members.
                  </p>
                ) : (
                  nonMembers.map((u) => {
                    const sent = invitedUids.includes(u.uid);
                    return (
                      <div
                        key={u.uid}
                        className="p-3 rounded-xl bg-[#06060A] border border-white/10 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ResilientImage
                            src={u.avatarUrl}
                            alt={u.displayName}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{u.displayName}</p>
                            <p className="text-[11px] text-[#94A3B8] truncate">@{u.username}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={sent}
                          onClick={async () => {
                            await sendSpaceInviteNotification(activeSpace, profile, u.uid);
                            setInvitedUids((prev) => [...prev, u.uid]);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            sent
                              ? 'bg-white/10 text-[#C084FC]'
                              : 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                          }`}
                        >
                          {sent ? 'Invited' : 'Send Invite'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {showEventModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await createSpaceEvent({
                  spaceId: activeSpace.id,
                  host: profile,
                  title: eventTitle,
                  description: eventDesc,
                  scheduledFor: eventDate,
                });
                setEventTitle('');
                setEventDesc('');
                setEventDate('');
                setShowEventModal(false);
              }}
              className="w-full max-w-md bg-[#0D0B16] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold text-white">
                  Schedule Space Event
                </h3>
                <button type="button" onClick={() => setShowEventModal(false)}>
                  <X size={18} className="text-[#94A3B8]" />
                </button>
              </div>
              <input
                type="text"
                required
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Event title"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
              />
              <input
                type="text"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                placeholder="Date & time (e.g., Nov 24 · 19:00 UTC)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
              />
              <textarea
                rows={3}
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                placeholder="Event details..."
                className="w-full p-3.5 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none resize-none"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                Create Event
              </button>
            </form>
          </div>
        )}

        {editingCover && (
          <CoverEditorModal
            title={`Edit Cover — ${activeSpace.name}`}
            initialUrl={activeSpace.coverUrl}
            initialPositionY={activeSpace.coverPositionY}
            uploadFolder={`spaces/${activeSpace.id}/cover`}
            onSave={(url, posY) => updateSpaceCover(activeSpace.id, url, posY)}
            onClose={() => setEditingCover(false)}
          />
        )}
      </div>
    );
  }

  // SPACES DESKTOP EXPLORE LAYOUT (Left Sidebar + Explore Spaces Grid)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* LEFT SIDEBAR: Discover, My Spaces, Invites, Joined, Create Space */}
      <aside className="lg:col-span-3 space-y-5">
        <div className="sticky top-24 p-4 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-1.5">
          {[
            { id: 'discover', label: 'Discover', icon: Compass },
            { id: 'mine', label: 'My Spaces', icon: Layers },
            { id: 'invites', label: 'Invites', icon: Mail, badge: spaceInvites.filter((i) => !i.read).length },
            { id: 'joined', label: 'Joined', icon: UserCheck },
            { id: 'create', label: 'Create Space', icon: FolderPlus },
          ].map((item) => {
            const Icon = item.icon;
            const active = sidebarTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSidebarTab(item.id as typeof sidebarTab)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)]'
                    : 'text-[#CBD5E1] hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Icon size={16} />
                  <span>{item.label}</span>
                </span>
                {item.badge && item.badge > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-black/35 text-[10px] font-mono-tabular">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="lg:col-span-9 space-y-6">
        {sidebarTab === 'create' ? (
          <form
            onSubmit={handleCreateSpace}
            className="max-w-3xl p-4 sm:p-7 rounded-3xl bg-[#0D0B16] border border-[#8B5CF6]/20 space-y-6"
          >
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Create a Space</h1>
              <p className="text-xs text-[#94A3B8] mt-1">
                Build a visual community with shared feeds, live audio rooms, events, and member roles.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Community Name</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Founders & Venture Circle"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] text-sm text-white outline-none"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#CBD5E1]">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] text-sm text-white outline-none"
                >
                  {[...PRIMARY_CATEGORIES.filter((c) => c !== 'All'), ...EXTRA_CATEGORIES].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#CBD5E1]">Description</span>
              <textarea
                rows={3}
                required
                maxLength={400}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what brings members together..."
                className="w-full p-4 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] text-sm text-white outline-none resize-none"
              />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#CBD5E1]">Community Cover Image</span>
                <input
                  ref={createCoverFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleUploadCreateCover}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingCover}
                  onClick={() => createCoverFileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs text-white"
                >
                  <Upload size={13} /> {uploadingCover ? 'Uploading...' : 'Upload Custom Cover'}
                </button>
              </div>

              <div className="relative aspect-[16/6] rounded-2xl overflow-hidden border border-[#8B5CF6]/25 bg-black">
                <ResilientImage src={coverUrl} alt="Selected Space cover" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent p-4 flex flex-col justify-end">
                  <p className="font-display text-lg font-bold text-white">{name || 'Community Preview'}</p>
                  <p className="text-xs text-[#CBD5E1]">{category}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                {DEFAULT_COVERS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCoverUrl(c)}
                    className={`rounded-xl overflow-hidden aspect-video border-2 transition-all ${
                      coverUrl === c ? 'border-[#8B5CF6]' : 'border-transparent opacity-65 hover:opacity-100'
                    }`}
                  >
                    <img src={c} alt="Cover option" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs text-[#CBD5E1] cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="accent-[#7C3AED]"
              />
              Private invite-only Space
            </label>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={creating || uploadingCover}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_20px_rgba(124,58,237,0.4)]"
            >
              {creating ? 'Publishing Space...' : 'Create Space'}
            </button>
          </form>
        ) : sidebarTab === 'invites' ? (
          <div className="space-y-4">
            <h1 className="font-display text-2xl font-bold text-white">Space Invitations</h1>
            {spaceInvites.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-2">
                <Users size={26} className="mx-auto text-[#8B5CF6]" />
                <h2 className="font-display text-base font-semibold text-white">
                  No pending invitations
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  When Space owners or admins invite you, invitations appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {spaceInvites.map((inv) => {
                  const targetSpace = spaces.find((s) => s.id === inv.targetId);
                  const alreadyJoined = targetSpace ? Boolean(membershipsMap[targetSpace.id]) : false;
                  return (
                    <div
                      key={inv.id}
                      className="p-5 rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <ResilientImage
                          src={inv.actorAvatar}
                          alt={inv.actorName}
                          className="w-11 h-11 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">
                            {inv.actorName}
                          </p>
                          <p className="text-xs text-[#CBD5E1] truncate">{inv.preview}</p>
                        </div>
                      </div>
                      {targetSpace && (
                        <button
                          type="button"
                          onClick={async () => {
                            await markNotificationRead(inv.id);
                            if (!alreadyJoined) {
                              await toggleSpaceMembership(targetSpace, profile, false);
                            }
                            setActiveSpaceId(targetSpace.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white shrink-0"
                        >
                          <Check size={14} /> {alreadyJoined ? 'Open Space' : 'Accept & Join'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Explore Spaces Header + Search + Category Filter Strip */}
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl lg:text-3xl font-bold text-white tracking-tight">
                    {sidebarTab === 'mine'
                      ? 'My Spaces'
                      : sidebarTab === 'joined'
                      ? 'Joined Spaces'
                      : 'Explore Spaces'}
                  </h1>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    Curated visual communities with dedicated discussions, events, and live rooms.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search
                      size={14}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C6E9B]"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter spaces..."
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 focus:border-[#8B5CF6] text-xs text-white outline-none min-h-[42px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('create')}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white whitespace-nowrap min-h-[42px]"
                  >
                    <Plus size={14} /> Create Space
                  </button>
                </div>
              </div>

              {/* Category Filters: All | Faith | Business | Finance | Lifestyle | Education | More */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {PRIMARY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                        selectedCategory === cat
                          ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)]'
                          : 'bg-[#0D0B16] border border-white/[0.08] text-[#CBD5E1] hover:border-[#8B5CF6]/40 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowMoreCategories((v) => !v)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                      EXTRA_CATEGORIES.includes(selectedCategory)
                        ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                        : 'bg-[#0D0B16] border border-white/[0.08] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {showMoreCategories ? 'Less' : 'More'}
                  </button>
                </div>

                {showMoreCategories && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {EXTRA_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                          selectedCategory === cat
                            ? 'bg-[#7C3AED] text-white'
                            : 'bg-[#0D0B16] border border-white/[0.08] text-[#94A3B8] hover:text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cover-Integrated Community Cards Grid */}
            {filteredSpaces.length === 0 ? (
              <div className="p-12 rounded-3xl bg-[#0D0B16] border border-white/[0.08] text-center space-y-3">
                <Compass size={26} className="mx-auto text-[#8B5CF6]" />
                <p className="text-sm font-semibold text-white">No Spaces found</p>
                <p className="text-xs text-[#94A3B8]">
                  Try another category filter or create a new Space in {selectedCategory}.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredSpaces.map((space) => {
                  const joined = Boolean(membershipsMap[space.id]);
                  const isOwner = space.ownerId === profile.uid;
                  return (
                    <div
                      key={space.id}
                      onClick={() => setActiveSpaceId(space.id)}
                      className="group relative rounded-3xl overflow-hidden border border-[#8B5CF6]/20 hover:border-[#8B5CF6]/60 min-h-[240px] sm:aspect-[16/10] bg-[#0D0B16] cursor-pointer shadow-[0_12px_40px_rgba(0,0,0,0.55)] transition-all"
                    >
                      <ResilientImage
                        src={space.coverUrl}
                        alt={space.name}
                        style={{ objectPosition: `50% ${space.coverPositionY ?? 50}%` }}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />

                      {/* Measured contrast scrim: ALL community information integrated directly ON THE COVER IMAGE */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/25 p-4 sm:p-6 flex flex-col justify-between">
                        {/* Top metadata strip */}
                        <div className="flex items-center justify-between text-xs text-white/85">
                          <span className="font-medium inline-flex items-center gap-1.5">
                            {space.category}
                            {space.isPrivate && <Lock size={11} className="text-[#C084FC]" />}
                          </span>
                          <span className="font-mono-tabular text-[11px] text-white/75">
                            Created{' '}
                            {space.createdAt?.toDate
                              ? space.createdAt.toDate().toLocaleDateString('en-US', {
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '2026'}
                          </span>
                        </div>

                        {/* Bottom community identity, description, owner, count & join action */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <h2 className="font-display text-xl lg:text-2xl font-bold text-white inline-flex items-center gap-2">
                              {space.name}
                              {space.verified && <VerifiedBadge size={17} />}
                              {space.status === 'pending' && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/30 text-[10px] font-medium text-amber-300">
                                  Pending Approval
                                </span>
                              )}
                              {space.status === 'suspended' && (
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-400/30 text-[10px] font-medium text-rose-300">
                                  Suspended
                                </span>
                              )}
                            </h2>
                            <p className="text-xs text-[#E2E8F0] line-clamp-2 leading-relaxed">
                              {space.description}
                            </p>
                          </div>

                          <div className="flex items-end justify-between gap-4 pt-3 border-t border-white/15">
                            <div className="text-xs text-[#CBD5E1] space-y-0.5">
                              <p>
                                By <span className="text-white font-semibold">@{space.ownerUsername}</span>
                              </p>
                              <p className="font-mono-tabular text-[11px] text-[#C084FC]">
                                {formatCompactCount(space.membersCount)} members
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isOwner) {
                                  setActiveSpaceId(space.id);
                                } else {
                                  void toggleSpaceMembership(space, profile, joined);
                                }
                              }}
                              className={`px-5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                                isOwner || joined
                                  ? 'bg-white/15 hover:bg-white/25 text-white border border-white/15'
                                  : 'bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-white shadow-[0_4px_16px_rgba(124,58,237,0.4)]'
                              }`}
                            >
                              {isOwner ? 'Manage' : joined ? 'Joined' : 'Join'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
