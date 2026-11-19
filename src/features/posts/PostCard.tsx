import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  Flag,
  Gift,
  Heart,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Share2,
  Tag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { GiftPickerModal } from '../../components/gifts/GiftPickerModal';
import { useAuth } from '../../hooks/useAuth';
import {
  addPostComment,
  checkPostLiked,
  deletePost,
  removeSelfTagFromPost,
  repostPost,
  respondToCollaborationInvite,
  submitModerationReport,
  subscribePostComments,
  togglePostLike,
  toggleSavePost,
  voteOnPoll,
} from '../../services/firebase/socialService';
import { Post, PostComment } from '../../types/nexora';
import { formatCompactCount, formatRelativeTime } from '../../utils/validation';

interface PostCardProps {
  post: Post;
  isSaved: boolean;
  onOpenProfile: (uid: string) => void;
}

export function PostCard({ post, isSaved, onOpenProfile }: PostCardProps) {
  const { profile, getUserBadges } = useAuth();
  const postBadges = getUserBadges(post.authorId, post.authorVerified);
  const [liked, setLiked] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetType, setReportTargetType] = useState<'post' | 'collab'>('post');
  const [reportReason, setReportReason] = useState('');
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [collabBusy, setCollabBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    void checkPostLiked(post.id, profile.uid).then(setLiked);
  }, [post.id, profile]);

  useEffect(() => {
    if (!showComments) return;
    return subscribePostComments(post.id, setComments);
  }, [post.id, showComments]);

  if (!profile) return null;

  const acceptedCollabUids = post.collaboratorUids || [];
  const invitedCollabUids = post.collaboratorInviteUids || [];
  const declinedCollabUids = post.declinedCollaboratorUids || [];
  const isPendingCollabInvitee =
    invitedCollabUids.includes(profile.uid) &&
    !acceptedCollabUids.includes(profile.uid) &&
    !declinedCollabUids.includes(profile.uid);

  const taggedUids = post.taggedUids || [];
  const taggedUsernames = post.taggedUsernames || [];
  const isTaggedUser = taggedUids.includes(profile.uid);

  const handleLike = async () => {
    const next = await togglePostLike(post, profile);
    setLiked(next);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareToast('Link copied');
    } catch {
      setShareToast('Ready to share');
    }
    setTimeout(() => setShareToast(''), 1800);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    await addPostComment({
      post,
      author: profile,
      text: commentText,
      parentCommentId: replyTo?.id || '',
    });
    setCommentText('');
    setReplyTo(null);
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    await submitModerationReport({
      reporterId: profile.uid,
      targetType: reportTargetType,
      targetId: post.id,
      reason: reportReason,
    });
    setReportReason('');
    setReportModalOpen(false);
    setShareToast('Report submitted');
    setTimeout(() => setShareToast(''), 2000);
  };

  const handleCollabResponse = async (decision: 'accept' | 'decline') => {
    setCollabBusy(true);
    try {
      await respondToCollaborationInvite({
        post,
        responder: profile,
        decision,
      });
      setShareToast(decision === 'accept' ? 'Collaboration accepted' : 'Invite declined');
      setTimeout(() => setShareToast(''), 2000);
    } finally {
      setCollabBusy(false);
    }
  };

  const handleSelfUntag = async () => {
    await removeSelfTagFromPost({ post, user: profile });
    setShareToast('Tag removed');
    setTimeout(() => setShareToast(''), 1800);
  };

  const totalVotes = (post.pollCounts || []).reduce((acc, n) => acc + n, 0);

  return (
    <article className="px-5 py-5 rounded-2xl bg-[#0D0B16]/70 hover:bg-[#0D0B16] transition-colors border border-white/[0.05] hover:border-[#8B5CF6]/20 space-y-3.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onOpenProfile(post.authorId)}
            className="shrink-0"
          >
            <ResilientImage
              src={post.authorAvatar}
              alt={post.authorName}
              className="w-10 h-10 rounded-full object-cover ring-1 ring-[#8B5CF6]/35"
            />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenProfile(post.authorId)}
                className="font-display text-sm font-semibold text-white hover:text-[#C084FC] truncate"
              >
                {post.authorName}
              </button>
              <BadgeStrip badges={postBadges} size={14} max={3} />
              <span className="text-xs text-[#64748B] truncate">@{post.authorUsername}</span>
              {acceptedCollabUids.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-[#CBD5E1] flex-wrap">
                  <span className="text-[#64748B]">with</span>
                  {acceptedCollabUids.map((collabUid, idx) => {
                    const summary = post.collaboratorProfiles?.[collabUid];
                    const collabBadges = getUserBadges(collabUid, false);
                    return (
                      <React.Fragment key={collabUid}>
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onOpenProfile(collabUid)}
                            className="font-semibold text-[#C084FC] hover:underline"
                          >
                            @{summary?.username || 'collaborator'}
                          </button>
                          <BadgeStrip badges={collabBadges} size={12} max={2} />
                        </span>
                        {idx < acceptedCollabUids.length - 1 && <span className="text-[#64748B]">,</span>}
                      </React.Fragment>
                    );
                  })}
                </span>
              )}
              <span aria-hidden="true" className="text-xs text-[#64748B]">·</span>
              <span className="text-xs text-[#64748B]">{formatRelativeTime(post.createdAt)}</span>
            </div>
            {(post.spaceName || post.location || post.type === 'repost') && (
              <p className="text-[11px] text-[#94A3B8] flex items-center gap-2 mt-0.5">
                {post.type === 'repost' && <span className="text-[#C084FC]">Reposted</span>}
                {post.spaceName && <span>in {post.spaceName}</span>}
                {post.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} className="text-[#A855F7]" /> {post.location}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/5"
            aria-label="Post options"
          >
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-xl shadow-2xl p-1.5 z-20">
              {post.authorId === profile.uid ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    void deletePost(post.id, profile.uid);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 text-left"
                >
                  <Trash2 size={14} /> Delete Post
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setReportTargetType('post');
                      setReportModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#E2E8F0] hover:bg-white/5 text-left"
                  >
                    <Flag size={14} /> Report Post
                  </button>
                  {(acceptedCollabUids.length > 0 || taggedUids.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setReportTargetType('collab');
                        setReportModalOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-amber-300 hover:bg-white/5 text-left"
                    >
                      <Flag size={14} /> Report Tag / Collab
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Pending Collaboration Invitation Banner */}
      {isPendingCollabInvitee && (
        <div className="ml-[52px] px-3.5 py-2.5 rounded-xl bg-[#161029] border border-[#8B5CF6]/40 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-xs text-[#E9D5FF]">
            <UserPlus size={14} className="text-[#C084FC] shrink-0" />
            <span>
              <strong>@{post.authorUsername}</strong> invited you to co-author this post.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={collabBusy}
              onClick={() => void handleCollabResponse('accept')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-[11px] font-semibold text-white"
            >
              <Check size={12} /> Accept
            </button>
            <button
              type="button"
              disabled={collabBusy}
              onClick={() => void handleCollabResponse('decline')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold text-[#CBD5E1]"
            >
              <X size={12} /> Decline
            </button>
          </div>
        </div>
      )}

      {/* Text Content */}
      {post.text && (
        <p className="text-[15px] text-[#E2E8F0] leading-relaxed whitespace-pre-wrap break-words pl-[52px]">
          {post.text.split(/(\s+)/).map((token, i) => {
            if (token.startsWith('#') || token.startsWith('@')) {
              return (
                <span key={i} className="text-[#C084FC] font-medium">
                  {token}
                </span>
              );
            }
            return token;
          })}
        </p>
      )}

      {/* Tagged Users Chip Strip (Distinct from @mentions) */}
      {taggedUids.length > 0 && (
        <div className="pl-[52px] flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 text-[#94A3B8]">
            <Tag size={11} className="text-sky-400" /> Tagged:
          </span>
          {taggedUids.map((tUid, idx) => (
            <button
              key={tUid}
              type="button"
              onClick={() => onOpenProfile(tUid)}
              className="px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-400/25 text-sky-300 hover:bg-sky-500/20"
            >
              @{taggedUsernames[idx] || 'member'}
            </button>
          ))}
          {isTaggedUser && (
            <button
              type="button"
              onClick={() => void handleSelfUntag()}
              className="px-2 py-0.5 rounded-md bg-white/[0.06] text-[#CBD5E1] hover:text-rose-300"
            >
              Remove my tag
            </button>
          )}
        </div>
      )}

      {/* Media Gallery */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div
          className={`pl-[52px] grid gap-2.5 ${
            post.mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
          }`}
        >
          {post.mediaUrls.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="rounded-xl overflow-hidden bg-[#06060A]"
            >
              {post.mediaTypes?.[idx] === 'video' ? (
                <video src={url} controls playsInline className="w-full max-h-[460px]" />
              ) : (
                <ResilientImage
                  src={url}
                  alt={`Attachment ${idx + 1}`}
                  className="w-full max-h-[460px] object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Poll */}
      {post.type === 'poll' && post.pollOptions && post.pollOptions.length > 0 && (
        <div className="pl-[52px] space-y-2 pt-1">
          {post.pollOptions.map((option, idx) => {
            const votes = post.pollCounts?.[idx] || 0;
            const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => void voteOnPoll(post, profile.uid, idx)}
                className="relative w-full text-left px-4 py-2.5 rounded-xl border border-[#8B5CF6]/20 bg-[#08070F] hover:border-[#8B5CF6]/55 overflow-hidden transition-colors"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#6D28D9]/35 to-[#9333EA]/25 transition-all"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between text-xs">
                  <span className="font-medium text-white">{option}</span>
                  <span className="font-mono-tabular text-[#CBD5E1]">{pct}%</span>
                </div>
              </button>
            );
          })}
          <p className="text-[11px] font-mono-tabular text-[#64748B]">
            {totalVotes} total votes
          </p>
        </div>
      )}

      {/* Action Bar */}
      <div className="pl-[52px] flex items-center justify-between pt-2 text-xs text-[#94A3B8]">
        <div className="flex items-center gap-5 sm:gap-6 flex-wrap">
          <button
            type="button"
            onClick={handleLike}
            className={`inline-flex items-center gap-1.5 transition-colors ${
              liked ? 'text-[#C084FC] font-semibold' : 'hover:text-white'
            }`}
          >
            <Heart size={16} className={liked ? 'fill-[#A855F7] text-[#A855F7]' : ''} />
            <span className="font-mono-tabular">{formatCompactCount(post.likesCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments((v) => !v)}
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <MessageCircle size={16} />
            <span className="font-mono-tabular">{formatCompactCount(post.commentsCount)}</span>
          </button>

          <button
            type="button"
            onClick={() => void repostPost(post, profile)}
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Repeat2 size={16} />
            <span className="font-mono-tabular">{formatCompactCount(post.repostsCount)}</span>
          </button>

          {post.authorId !== profile.uid ? (
            <button
              type="button"
              onClick={() => setGiftModalOpen(true)}
              className="inline-flex items-center gap-1.5 hover:text-[#C084FC] transition-colors"
              title="Send a free virtual gift"
            >
              <Gift size={16} className="text-[#C084FC]" />
              <span className="font-mono-tabular">{formatCompactCount(post.giftsCount || 0)}</span>
            </button>
          ) : (
            (post.giftsCount || 0) > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[#C084FC]">
                <Gift size={15} />
                <span className="font-mono-tabular">{formatCompactCount(post.giftsCount || 0)}</span>
              </span>
            )
          )}

          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
          >
            <Share2 size={16} />
            {shareToast && <span className="text-[#C084FC]">{shareToast}</span>}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void toggleSavePost(post, profile.uid)}
          className={`inline-flex items-center gap-1.5 transition-colors ${
            isSaved ? 'text-[#C084FC]' : 'hover:text-white'
          }`}
          aria-label="Save post"
        >
          <Bookmark size={16} className={isSaved ? 'fill-[#A855F7] text-[#A855F7]' : ''} />
        </button>
      </div>

      {/* Comments & Replies */}
      {showComments && (
        <div className="pl-[52px] pt-3 border-t border-white/[0.06] space-y-3">
          <form onSubmit={handleCommentSubmit} className="space-y-2">
            {replyTo && (
              <div className="flex items-center justify-between text-[11px] text-[#C084FC] bg-[#7C3AED]/10 px-3 py-1 rounded-lg">
                <span>Replying to @{replyTo.authorUsername}</span>
                <button type="button" onClick={() => setReplyTo(null)}>
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={1000}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none focus:border-[#8B5CF6]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white"
              >
                Reply
              </button>
            </div>
          </form>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-xs text-[#64748B]">No replies yet. Start the discussion.</p>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className={`py-2.5 px-3 rounded-xl bg-[#08070F] space-y-1 ${
                    c.parentCommentId ? 'ml-6 border-l-2 border-[#7C3AED]/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ResilientImage
                        src={c.authorAvatar}
                        alt={c.authorName}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <span className="text-xs font-semibold text-white inline-flex items-center gap-1">
                        {c.authorName}
                        <BadgeStrip
                          badges={getUserBadges(c.authorId, c.authorVerified)}
                          size={12}
                          max={2}
                        />
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        {formatRelativeTime(c.createdAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(c)}
                      className="text-[11px] text-[#C084FC] hover:underline"
                    >
                      Reply
                    </button>
                  </div>
                  <p className="text-xs text-[#CBD5E1]">{c.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Report Modal */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleReport}
            className="w-full max-w-md bg-[#0D0B16] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-semibold text-white">
              {reportTargetType === 'collab' ? 'Report Collaboration or Tag Abuse' : 'Report Content'}
            </h3>
            <textarea
              rows={3}
              required
              maxLength={300}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe the issue (spam, unwanted tag, impersonation, harassment)..."
              className="w-full p-3 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-4 py-2 text-xs text-[#94A3B8]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-xs font-semibold text-white"
              >
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      <GiftPickerModal
        open={giftModalOpen}
        onClose={() => setGiftModalOpen(false)}
        recipient={{
          uid: post.authorId,
          displayName: post.authorName,
          username: post.authorUsername,
        }}
        targetType="post"
        targetId={post.id}
        onSent={(giftName) => {
          setShareToast(`Sent ${giftName}`);
          setTimeout(() => setShareToast(''), 2200);
        }}
      />
    </article>
  );
}
