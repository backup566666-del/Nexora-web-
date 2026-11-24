import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  BellOff,
  Bot,
  Check,
  CheckCheck,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  Flag,
  Forward,
  Image as ImageIcon,
  Info,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  PhoneCall,
  PhoneOff,
  Pin,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Square,
  Trash2,
  User as UserIcon,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  AnyPresenceDisplayStatus,
  PresenceBadge,
  TypingWithPresence,
} from '../../components/common/PresenceBadge';
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { TierBadge } from '../../components/common/TierBadge';
import { CustomisedAvatar } from '../../components/profile/CustomisedAvatar';
import { GeminiChatbotPanel } from '../../components/ai/GeminiChatbotPanel';
import { FriendlyErrorBanner } from '../../components/common/FriendlyErrorBanner';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
  blockUserAccount,
  createGroupConversation,
  createOrGetDirectConversation,
  deleteChatMessage,
  editChatMessage,
  forwardChatMessage,
  isUserOnlineNow,
  markConversationRead,
  searchDirectoryUsers,
  sendChatMessage,
  setConversationTyping,
  submitModerationReport,
  subscribeConversations,
  subscribeMessages,
  subscribeUserPreferences,
  subscribeUserProfile,
  toggleMessageReaction,
  toggleMuteConversation,
  togglePinConversation,
  unblockUserAccount,
} from '../../services/firebase/socialService';
import { uploadBlobAsset, uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { ChatMessage, Conversation, Story, UserPreferences, UserProfile } from '../../types/nexora';
import { getMessagingCryptoStatus } from '../../utils/cryptoProtocol';
import { formatRelativeTime } from '../../utils/validation';

interface ChatPageProps {
  users: UserProfile[];
  stories: Story[];
  initialConvId?: string | null;
  onOpenProfile: (uid: string) => void;
}

interface CallLogEntry {
  id: string;
  convId: string;
  title: string;
  avatar: string;
  kind: 'audio' | 'video';
  durationSec: number;
  timestamp: string;
}

interface PendingOutboxMessage {
  clientId: string;
  convId: string;
  text: string;
  replyToId?: string;
  replyToText?: string;
  recipientIds: string[];
  status: 'sending' | 'failed';
  errorMessage?: string;
  createdAtLabel: string;
}

const QUICK_EMOJIS = ['💜', '🔥', '👏', '😂', '😮', '🙌', '✨', '👍'];

export function ChatPage({ users, stories, initialConvId, onOpenProfile }: ChatPageProps) {
  const {
    profile,
    privateInfo,
    adminPresenceMap,
    isAdminInvisibleActive,
    getUserBadges,
    getUserTier,
    getAdminEffectiveStatus,
    refreshUserAndProfile,
  } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userPrefs, setUserPrefs] = useState<UserPreferences | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConvId || null);
  const [mobileShowThread, setMobileShowThread] = useState<boolean>(Boolean(initialConvId));
  const [showAiAssistant, setShowAiAssistant] = useState<boolean>(false);
  const [showThreadInfo, setShowThreadInfo] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePartner, setActivePartner] = useState<UserProfile | null>(null);
  const [pendingOutbox, setPendingOutbox] = useState<PendingOutboxMessage[]>([]);

  const [convFilter, setConvFilter] = useState<'all' | 'unread' | 'groups' | 'calls'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const [safetyFeedback, setSafetyFeedback] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatError, setChatError] = useState('');

  const [showNewChat, setShowNewChat] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [remoteMemberUsers, setRemoteMemberUsers] = useState<UserProfile[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creatingConv, setCreatingConv] = useState(false);
  const [modalError, setModalError] = useState('');

  const [callState, setCallState] = useState<'idle' | 'audio' | 'video'>('idle');
  const [callSeconds, setCallSeconds] = useState(0);
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const callStreamRef = useRef<MediaStream | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const cryptoStatus = useMemo(() => getMessagingCryptoStatus(), []);

  useEffect(() => {
    if (initialConvId) {
      setSelectedConvId(initialConvId);
      setMobileShowThread(true);
    }
  }, [initialConvId]);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeConversations(profile.uid, (convs) => {
      setConversations(convs);
      setSelectedConvId((prev) => {
        if (prev && convs.some((c) => c.id === prev)) return prev;
        return convs.length > 0 ? convs[0].id : null;
      });
    });
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return;
    return subscribeUserPreferences(profile.uid, setUserPrefs);
  }, [profile?.uid]);

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId]
  );

  const activeOtherUid = useMemo(() => {
    if (!activeConv || activeConv.isGroup || !profile?.uid) return null;
    return activeConv.participantIds.find((id) => id !== profile.uid) || null;
  }, [activeConv, profile?.uid]);

  useEffect(() => {
    if (!activeOtherUid) {
      setActivePartner(null);
      return;
    }
    return subscribeUserProfile(activeOtherUid, setActivePartner);
  }, [activeOtherUid]);

  useEffect(() => {
    if (!selectedConvId || !profile?.uid) {
      setMessages([]);
      return;
    }
    void markConversationRead(selectedConvId, profile.uid);
    return subscribeMessages(selectedConvId, (msgs) => {
      setMessages(msgs);
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.senderId !== profile.uid) {
        void markConversationRead(selectedConvId, profile.uid);
      }
    });
  }, [selectedConvId, profile?.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedConvId]);

  useEffect(() => {
    if (!recordingVoice) {
      setVoiceSeconds(0);
      return;
    }
    const timer = window.setInterval(() => setVoiceSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recordingVoice]);

  useEffect(() => {
    if (isAdminInvisibleActive && selectedConvId && profile?.uid) {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
      void setConversationTyping(selectedConvId, profile.uid, false);
    }
  }, [isAdminInvisibleActive, selectedConvId, profile?.uid]);

  useEffect(() => {
    return () => {
      voiceRecorderRef.current?.stop();
      voiceStreamRef.current?.getTracks().forEach((t) => t.stop());
      callStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (callState === 'idle') {
      setCallSeconds(0);
      return;
    }
    const interval = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  useEffect(() => {
    const clean = memberSearch.trim();
    if (!showNewChat || clean.length < 2) {
      setRemoteMemberUsers([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const found = await searchDirectoryUsers(clean, 15).catch(() => []);
      if (!cancelled) setRemoteMemberUsers(found);
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [memberSearch, showNewChat]);

  if (!profile) return null;

  const blockedSet = new Set(privateInfo?.blockedUserIds || []);
  const allKnownUsersMap = new Map<string, UserProfile>();
  users.forEach((u) => allKnownUsersMap.set(u.uid, u));
  remoteMemberUsers.forEach((u) => {
    if (!allKnownUsersMap.has(u.uid)) allKnownUsersMap.set(u.uid, u);
  });
  if (activePartner) {
    allKnownUsersMap.set(activePartner.uid, activePartner);
  }

  const memberTerm = memberSearch.trim().toLowerCase();
  const otherUsers = Array.from(allKnownUsersMap.values())
    .filter((u) => u.uid !== profile.uid && !u.suspended && !blockedSet.has(u.uid))
    .filter(
      (u) =>
        !memberTerm ||
        u.displayName.toLowerCase().includes(memberTerm) ||
        u.username.toLowerCase().includes(memberTerm)
    );
  const allSelectableUsers = Array.from(allKnownUsersMap.values()).filter(
    (u) => u.uid !== profile.uid
  );

  const getOtherUid = (c: Conversation) => {
    if (c.isGroup) return null;
    return c.participantIds.find((id) => id !== profile.uid) || null;
  };

  const getConvTitle = (c: Conversation) => {
    if (c.isGroup) return c.title || 'Group Conversation';
    const otherId = getOtherUid(c);
    if (otherId && c.id === activeConv?.id && activePartner) {
      return activePartner.displayName;
    }
    const localUser = otherId ? allKnownUsersMap.get(otherId) : undefined;
    return localUser?.displayName || (otherId && c.participantNames?.[otherId]) || 'Direct Message';
  };

  const getConvAvatar = (c: Conversation) => {
    if (c.isGroup) return '/src/assets/images/space_cover_design_1795066814901.jpg';
    const otherId = getOtherUid(c);
    if (otherId && c.id === activeConv?.id && activePartner?.avatarUrl) {
      return activePartner.avatarUrl;
    }
    const localUser = otherId ? allKnownUsersMap.get(otherId) : undefined;
    return localUser?.avatarUrl || (otherId && c.participantAvatars?.[otherId]) || '';
  };

  const getOtherPartnerProfile = (c: Conversation) => {
    const otherId = getOtherUid(c);
    if (!otherId) return null;
    if (c.id === activeConv?.id && activePartner) return activePartner;
    return allKnownUsersMap.get(otherId) || null;
  };

  const getMemberBadgeStatus = (
    uid?: string | null,
    fallbackUser?: UserProfile | null
  ): AnyPresenceDisplayStatus | null => {
    if (!uid) return null;
    const adminRec = adminPresenceMap[uid];
    if (adminRec) {
      return adminRec.status === 'offline' ? null : adminRec.status;
    }
    return isUserOnlineNow(fallbackUser) ? 'online' : null;
  };

  const getOtherPresenceStatus = (c: Conversation): AnyPresenceDisplayStatus | null => {
    if (c.isGroup) return null;
    const otherId = getOtherUid(c);
    return getMemberBadgeStatus(otherId, getOtherPartnerProfile(c));
  };

  const getOtherOnline = (c: Conversation) => getOtherPresenceStatus(c) !== null;

  const getOtherBadges = (c: Conversation) => {
    if (c.isGroup) return [];
    const otherId = getOtherUid(c);
    if (!otherId) return [];
    const partner = getOtherPartnerProfile(c);
    return getUserBadges(otherId, partner?.verified);
  };

  const isConversationUnread = (c: Conversation) => {
    if (!c.lastMessageSenderId || c.lastMessageSenderId === profile.uid) return false;
    const myLastRead = c.readBy?.[profile.uid]?.toMillis?.() ?? 0;
    const lastMsgMs = c.lastMessageAt?.toMillis?.() ?? c.updatedAt?.toMillis?.() ?? 0;
    return lastMsgMs > myLastRead;
  };

  const getOtherTypingEntries = (c: Conversation) => {
    if (!c.typingBy) return [];
    const now = Date.now();
    return Object.entries(c.typingBy)
      .filter(([uid, ts]) => {
        if (uid === profile.uid) return false;
        if (now - (ts?.toMillis?.() ?? 0) >= 7000) return false;
        const adminRec = adminPresenceMap[uid];
        if (adminRec && adminRec.status === 'offline') return false;
        return true;
      })
      .map(([uid]) => ({
        uid,
        name: c.participantNames?.[uid] || 'Someone',
        adminStatus: getAdminEffectiveStatus(uid),
      }));
  };

  const getOtherTypingNames = (c: Conversation) => getOtherTypingEntries(c).map((entry) => entry.name);

  const isMessageReadByOther = (m: ChatMessage, c: Conversation) => {
    if (!c.readBy || m.senderId !== profile.uid) return false;
    const msgTime = m.createdAt?.toMillis?.() ?? 0;
    if (!msgTime) return false;
    return c.participantIds.some(
      (id) => id !== profile.uid && (c.readBy?.[id]?.toMillis?.() ?? 0) >= msgTime
    );
  };

  const isMessageDelivered = (m: ChatMessage, c: Conversation) => {
    if (m.senderId !== profile.uid) return false;
    return Boolean(m.createdAt?.toMillis?.()) || c.participantIds.length > 1;
  };

  const pinnedSet = new Set(userPrefs?.pinnedConvIds || []);
  const mutedSet = new Set(userPrefs?.mutedConvIds || []);
  const activePartnerBlocked = Boolean(activeOtherUid && blockedSet.has(activeOtherUid));

  const filteredConversations = [...conversations]
    .filter((c) => {
      const matchesSearch = getConvTitle(c).toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (convFilter === 'unread') return isConversationUnread(c);
      if (convFilter === 'groups') return c.isGroup;
      return true;
    })
    .sort((a, b) => {
      const aPinned = pinnedSet.has(a.id) ? 1 : 0;
      const bPinned = pinnedSet.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0);
    });

  const unreadConvCount = conversations.filter(
    (c) => !mutedSet.has(c.id) && isConversationUnread(c)
  ).length;

  const visibleMessages = messageSearchTerm.trim()
    ? messages.filter((m) => m.text.toLowerCase().includes(messageSearchTerm.toLowerCase()))
    : messages;

  const threadOutbox = activeConv
    ? pendingOutbox.filter((item) => item.convId === activeConv.id)
    : [];

  const selectConversation = (convId: string) => {
    setSelectedConvId(convId);
    setMobileShowThread(true);
    setShowAiAssistant(false);
    setShowMessageSearch(false);
    setShowHeaderMenu(false);
    setChatError('');
    setSafetyFeedback('');
    setReplyTo(null);
    setEditingMsg(null);
  };

  const handleMessageInput = (val: string) => {
    setMessageText(val);
    if (!activeConv) return;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    void setConversationTyping(activeConv.id, profile.uid, val.trim().length > 0, {
      suppressTyping: isAdminInvisibleActive,
    });
    if (val.trim().length > 0 && !isAdminInvisibleActive) {
      typingTimeoutRef.current = window.setTimeout(() => {
        void setConversationTyping(activeConv.id, profile.uid, false);
      }, 3500);
    }
  };

  const dispatchOutboxMessage = async (draft: PendingOutboxMessage) => {
    try {
      await sendChatMessage({
        convId: draft.convId,
        sender: profile,
        type: 'text',
        text: draft.text,
        replyToId: draft.replyToId,
        replyToText: draft.replyToText,
        recipientIds: draft.recipientIds,
      });
      setPendingOutbox((prev) => prev.filter((item) => item.clientId !== draft.clientId));
    } catch (err) {
      const friendly = extractReadableErrorMessage(
        err,
        "Your message wasn't sent. Please try again."
      );
      setPendingOutbox((prev) =>
        prev.map((item) =>
          item.clientId === draft.clientId
            ? { ...item, status: 'failed', errorMessage: friendly }
            : item
        )
      );
      setChatError(friendly);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !messageText.trim() || sendingMsg) return;
    if (activePartnerBlocked) {
      setChatError(
        'You blocked this user. Unblock them from conversation options to send messages.'
      );
      return;
    }
    setChatError('');
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    void setConversationTyping(activeConv.id, profile.uid, false);

    if (editingMsg) {
      setSendingMsg(true);
      try {
        await editChatMessage(activeConv.id, editingMsg.id, messageText);
        setEditingMsg(null);
        setMessageText('');
        setShowEmojiPicker(false);
      } catch (err) {
        setChatError(
          extractReadableErrorMessage(err, "We couldn't update your message. Please try again.")
        );
      } finally {
        setSendingMsg(false);
      }
      return;
    }

    const draft: PendingOutboxMessage = {
      clientId: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      convId: activeConv.id,
      text: messageText.trim(),
      replyToId: replyTo?.id,
      replyToText: replyTo?.text,
      recipientIds: activeConv.participantIds,
      status: 'sending',
      createdAtLabel: 'Sending...',
    };
    setPendingOutbox((prev) => [...prev, draft]);
    setMessageText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    await dispatchOutboxMessage(draft);
  };

  const handleToggleBlockPartner = async () => {
    if (!activeOtherUid) return;
    setShowHeaderMenu(false);
    setChatError('');
    try {
      if (activePartnerBlocked) {
        await unblockUserAccount(profile.uid, activeOtherUid, privateInfo?.blockedUserIds || []);
        setSafetyFeedback('User unblocked. You can resume messaging.');
      } else {
        await blockUserAccount(profile.uid, activeOtherUid, privateInfo?.blockedUserIds || []);
        setSafetyFeedback('User blocked. They can no longer reach you in direct messages.');
      }
      await refreshUserAndProfile(false);
    } catch (err) {
      setChatError(extractReadableErrorMessage(err, 'Unable to update block settings right now.'));
    }
  };

  const handleSubmitChatReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !reportReason.trim()) return;
    setReportBusy(true);
    try {
      await submitModerationReport({
        reporterId: profile.uid,
        targetType: activeOtherUid ? 'user' : 'message',
        targetId: activeOtherUid || activeConv.id,
        reason: reportReason.trim(),
      });
      setShowReportModal(false);
      setReportReason('');
      setSafetyFeedback('Your report has been submitted to Nexora moderation for review.');
    } catch (err) {
      setChatError(extractReadableErrorMessage(err, 'Unable to submit report. Please try again.'));
    } finally {
      setReportBusy(false);
    }
  };

  const handleAttachment = async (
    e: React.ChangeEvent<HTMLInputElement>,
    expected?: ('image' | 'video' | 'document')[]
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv) return;
    setChatError('');
    setUploadingMedia(true);
    setShowAttachMenu(false);
    try {
      const res = await uploadMediaAsset(file, `chat/${activeConv.id}/${profile.uid}`, expected);
      const msgType = res.category === 'audio' ? 'voice' : res.category;
      await sendChatMessage({
        convId: activeConv.id,
        sender: profile,
        type: msgType,
        text: msgType === 'document' ? res.fileName : '',
        mediaUrl: res.url,
        fileName: res.fileName,
        recipientIds: activeConv.participantIds,
      });
    } catch (err) {
      setChatError(extractReadableErrorMessage(err, 'Attachment upload failed.'));
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const toggleVoiceNote = async () => {
    if (!activeConv) return;
    if (recordingVoice) {
      voiceRecorderRef.current?.stop();
      setRecordingVoice(false);
      return;
    }
    setChatError('');
    const targetConvId = activeConv.id;
    const recipientIds = activeConv.participantIds;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const chunks: BlobPart[] = [];
      const mimeType =
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType });
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        voiceStreamRef.current = null;
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setUploadingMedia(true);
        try {
          const uploaded = await uploadBlobAsset(
            blob,
            'voice_note.webm',
            `chat/${targetConvId}/${profile.uid}`,
            'audio'
          );
          await sendChatMessage({
            convId: targetConvId,
            sender: profile,
            type: 'voice',
            text: 'Voice note',
            mediaUrl: uploaded.url,
            fileName: uploaded.fileName,
            recipientIds,
          });
        } catch (err) {
          setChatError(extractReadableErrorMessage(err, 'Unable to send voice note.'));
        } finally {
          setUploadingMedia(false);
        }
      };
      voiceRecorderRef.current = rec;
      rec.start();
      setRecordingVoice(true);
    } catch {
      setChatError('Microphone permission is required for voice notes.');
    }
  };

  const startCall = async (kind: 'audio' | 'video', targetConv = activeConv) => {
    if (!targetConv) return;
    setSelectedConvId(targetConv.id);
    setMobileShowThread(true);
    setCallState(kind);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video',
      });
      callStreamRef.current = stream;
      if (kind === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        void localVideoRef.current.play();
      }
    } catch {
      // Allow preview even if hardware devices are absent
    }
  };

  const endCall = () => {
    if (activeConv && callState !== 'idle') {
      setCallLogs((prev) => [
        {
          id: `${Date.now()}`,
          convId: activeConv.id,
          title: getConvTitle(activeConv),
          avatar: getConvAvatar(activeConv),
          kind: callState,
          durationSec: callSeconds,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev,
      ]);
    }
    callStreamRef.current?.getTracks().forEach((t) => t.stop());
    callStreamRef.current = null;
    setCallState('idle');
  };

  const handleCreateConversation = async () => {
    setModalError('');
    setChatError('');
    setCreatingConv(true);
    try {
      if (groupMode) {
        const members = allSelectableUsers.filter((u) => selectedMemberIds.includes(u.uid));
        const convId = await createGroupConversation(profile, groupTitle, members);
        selectConversation(convId);
      } else if (selectedMemberIds[0]) {
        const target = allSelectableUsers.find((u) => u.uid === selectedMemberIds[0]);
        if (target) {
          const convId = await createOrGetDirectConversation(
            profile,
            target,
            privateInfo?.blockedUserIds
          );
          selectConversation(convId);
        }
      }
      setShowNewChat(false);
      setSelectedMemberIds([]);
      setGroupTitle('');
      setMemberSearch('');
    } catch (err) {
      const msg = extractReadableErrorMessage(err, 'Could not start conversation.');
      setModalError(msg);
      setChatError(msg);
    } finally {
      setCreatingConv(false);
    }
  };

  const handleStartDMFromStory = async (authorId: string) => {
    if (authorId === profile.uid) return;
    const target = allKnownUsersMap.get(authorId);
    if (!target) {
      onOpenProfile(authorId);
      return;
    }
    setChatError('');
    try {
      const convId = await createOrGetDirectConversation(
        profile,
        target,
        privateInfo?.blockedUserIds
      );
      selectConversation(convId);
    } catch (err) {
      setChatError(extractReadableErrorMessage(err, 'Unable to open direct message.'));
    }
  };

  const activeTypingEntries = activeConv ? getOtherTypingEntries(activeConv) : [];
  const activeTypingUsers = activeTypingEntries.map((entry) => entry.name);
  const activeTypingAdminStatus =
    activeTypingEntries.find((e) => e.adminStatus && e.adminStatus !== 'offline')?.adminStatus || null;
  const activePartnerStatus = activeConv ? getOtherPresenceStatus(activeConv) : null;

  return (
    <div className="h-[calc(100dvh-8.25rem)] lg:h-[calc(100vh-5.75rem)] min-h-[420px] rounded-2xl border border-white/[0.08] bg-[#0B0A13] overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-[0_20px_70px_rgba(0,0,0,0.65)]">
      {/* LEFT PANEL – CONVERSATIONS INBOX */}
      <aside
        className={`${
          (mobileShowThread && activeConv) || showAiAssistant ? 'hidden lg:flex' : 'flex'
        } lg:col-span-4 xl:col-span-4 border-r border-white/[0.07] bg-[#0D0B16] flex-col min-h-0`}
      >
        <div className="p-4 border-b border-white/[0.07] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-display text-lg font-bold text-white">Messages</h2>
              {unreadConvCount > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-[#7C3AED]/25 border border-[#8B5CF6]/40 text-[11px] font-mono-tabular font-semibold text-[#E9D5FF]">
                  {unreadConvCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAiAssistant((prev) => !prev);
                  setMobileShowThread(false);
                }}
                aria-label="Toggle Gemini AI Chat"
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap min-h-[40px] ${
                  showAiAssistant
                    ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                    : 'bg-[#141122] border-white/[0.1] hover:border-[#8B5CF6]/50 text-[#E9D5FF]'
                }`}
              >
                <Bot size={14} className={showAiAssistant ? 'text-white' : 'text-[#C084FC]'} />
                <span>Gemini AI</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalError('');
                  setShowNewChat(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] hover:brightness-110 text-xs font-semibold text-white transition-all whitespace-nowrap min-h-[40px]"
              >
                <Plus size={14} /> New
              </button>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C6E9B]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#08070F] border border-white/[0.08] focus:border-[#8B5CF6] text-xs text-white placeholder:text-[#64748B] outline-none transition-colors min-h-[40px]"
            />
          </div>

          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#08070F] border border-white/[0.06]">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: unreadConvCount > 0 ? `Unread (${unreadConvCount})` : 'Unread' },
              { id: 'groups', label: 'Groups' },
              { id: 'calls', label: 'Calls' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setConvFilter(t.id as typeof convFilter)}
                className={`py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap truncate px-1 min-h-[34px] ${
                  convFilter === t.id
                    ? 'bg-[#7C3AED] text-white'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {stories.length > 0 && convFilter !== 'calls' && (
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pt-0.5">
              {stories
                .filter((s) => s.authorId !== profile.uid)
                .slice(0, 8)
                .map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => void handleStartDMFromStory(s.authorId)}
                    title={`Message ${s.authorName}`}
                    className="shrink-0 flex flex-col items-center gap-1 group"
                  >
                    <div className="p-0.5 rounded-full bg-gradient-to-tr from-[#5B21B6] to-[#A855F7] group-hover:scale-105 transition-transform">
                      <ResilientImage
                        src={s.authorAvatar}
                        alt={s.authorName}
                        className="w-9 h-9 rounded-full object-cover border-2 border-[#0D0B16]"
                      />
                    </div>
                    <span className="text-[10px] text-[#94A3B8] max-w-[44px] truncate group-hover:text-white">
                      {s.authorName.split(' ')[0]}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05]">
          {convFilter === 'calls' ? (
            <div className="p-4 space-y-4">
              {callLogs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-[#94A3B8] px-1">Recent Session Calls</p>
                  {callLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-[#08070F] border border-white/[0.06] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ResilientImage
                          src={log.avatar}
                          alt={log.title}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{log.title}</p>
                          <p className="text-[11px] text-[#94A3B8] font-mono-tabular">
                            {log.kind === 'video' ? 'Video' : 'Voice'} · {log.durationSec}s · {log.timestamp}
                          </p>
                        </div>
                      </div>
                      <PhoneCall size={14} className="text-[#A855F7] shrink-0" />
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-[#94A3B8] px-1">Start a Call</p>
                {conversations.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-4 text-center">
                    Start a conversation to enable voice &amp; video calls.
                  </p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl bg-[#08070F] border border-white/[0.06] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ResilientImage
                          src={getConvAvatar(c)}
                          alt={getConvTitle(c)}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{getConvTitle(c)}</p>
                          <p className="text-[11px] text-[#94A3B8]">
                            {getOtherOnline(c) ? 'Online' : 'Available'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void startCall('audio', c)}
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#161423] hover:bg-[#7C3AED] text-white transition-colors"
                          aria-label="Voice call"
                        >
                          <Phone size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void startCall('video', c)}
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#161423] hover:bg-[#7C3AED] text-white transition-colors"
                          aria-label="Video call"
                        >
                          <Video size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-2.5">
              <p className="text-xs text-[#94A3B8]">
                {convFilter === 'unread'
                  ? 'All conversations are caught up.'
                  : 'No conversations match your filter.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setModalError('');
                  setShowNewChat(true);
                }}
                className="text-xs text-[#C084FC] font-medium hover:underline py-2"
              >
                Start a direct or group message
              </button>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const selected = c.id === selectedConvId;
              const isPinned = pinnedSet.has(c.id);
              const isMuted = mutedSet.has(c.id);
              const partner = getOtherPartnerProfile(c);
              const partnerStatus = getOtherPresenceStatus(c);
              const unread = isConversationUnread(c);
              const typingEntries = getOtherTypingEntries(c);
              const typingNames = typingEntries.map((entry) => entry.name);
              const typingStatus =
                typingEntries.find((entry) => entry.adminStatus && entry.adminStatus !== 'offline')?.adminStatus ||
                (partnerStatus && partnerStatus !== 'offline' && partnerStatus !== 'invisible'
                  ? partnerStatus
                  : null);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors min-h-[68px] ${
                    selected
                      ? 'bg-gradient-to-r from-[#7C3AED]/18 via-[#7C3AED]/8 to-transparent'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <CustomisedAvatar
                      src={getConvAvatar(c)}
                      alt={getConvTitle(c)}
                      sizeClass="w-11 h-11"
                      customisation={partner?.profileCustomisation}
                    />
                    {partnerStatus && (
                      <span className="absolute bottom-0 right-0">
                        <PresenceBadge status={partnerStatus} size="sm" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate inline-flex items-center gap-1.5">
                        {isPinned && <Pin size={11} className="text-[#C084FC] shrink-0" />}
                        <span className="truncate">{getConvTitle(c)}</span>
                        <BadgeStrip badges={getOtherBadges(c)} size={13} max={2} interactive={false} />
                        {partner && (
                          <TierBadge
                            tier={getUserTier(partner.uid, partner.subscriptionTier)}
                            size="xs"
                          />
                        )}
                      </p>
                      <span className="text-[11px] font-mono-tabular text-[#64748B] shrink-0 inline-flex items-center gap-1">
                        {isMuted && <BellOff size={11} className="text-[#64748B]" />}
                        {formatRelativeTime(c.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      {typingNames.length > 0 ? (
                        <TypingWithPresence
                          status={typingStatus}
                          label={`${typingNames[0]} is typing`}
                        />
                      ) : (
                        <p
                          className={`text-xs truncate ${
                            unread ? 'text-white font-medium' : 'text-[#94A3B8]'
                          }`}
                        >
                          {c.lastMessageText || 'Conversation started'}
                        </p>
                      )}
                      {unread && !isMuted && (
                        <span
                          aria-label="Unread message"
                          className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] shrink-0"
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* CENTER + OPTIONAL RIGHT INFO PANEL */}
      <section
        className={`${
          !showAiAssistant && (!mobileShowThread || !activeConv) ? 'hidden lg:flex' : 'flex'
        } lg:col-span-8 flex-1 min-h-0 bg-[#08070F]`}
      >
        {showAiAssistant ? (
          <div className="flex flex-col flex-1 h-full min-h-0 p-3 sm:p-4 gap-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAiAssistant(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161423] border border-white/10 text-xs font-semibold text-[#CBD5E1] hover:text-white"
              >
                <ArrowLeft size={14} />
                <span>Back to Messages</span>
              </button>
              <span className="text-[11px] text-[#94A3B8]">
                Gemini Multi-Turn Assistant
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <GeminiChatbotPanel compact />
            </div>
          </div>
        ) : activeConv ? (
          <div className="flex flex-1 min-w-0 min-h-0">
            {/* Active Message Stream Column */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              {/* Active Conversation Header */}
              <div className="px-3 sm:px-5 py-3 border-b border-white/[0.07] bg-[#0D0B16] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileShowThread(false)}
                    aria-label="Back to conversations"
                    className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#161423] border border-white/10 text-[#CBD5E1] hover:text-white shrink-0"
                  >
                    <ArrowLeft size={17} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (activeOtherUid) onOpenProfile(activeOtherUid);
                      else setShowMembersModal(true);
                    }}
                    className="flex items-center gap-3 min-w-0 text-left group"
                    title={activeOtherUid ? 'Open user profile' : 'View group participants'}
                  >
                    <div className="relative shrink-0">
                      <CustomisedAvatar
                        src={getConvAvatar(activeConv)}
                        alt={getConvTitle(activeConv)}
                        sizeClass="w-10 h-10"
                        customisation={activePartner?.profileCustomisation}
                      />
                      {activePartnerStatus && (
                        <span className="absolute bottom-0 right-0">
                          <PresenceBadge status={activePartnerStatus} size="sm" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display text-sm sm:text-base font-semibold text-white group-hover:text-[#C084FC] transition-colors truncate inline-flex items-center gap-1.5 max-w-full">
                        <span className="truncate">{getConvTitle(activeConv)}</span>
                        <BadgeStrip
                          badges={getOtherBadges(activeConv)}
                          size={14}
                          max={3}
                          interactive={false}
                        />
                        {activePartner && (
                          <TierBadge
                            tier={getUserTier(activePartner.uid, activePartner.subscriptionTier)}
                            size="xs"
                          />
                        )}
                      </h2>
                      <div className="text-[11px] sm:text-xs text-[#94A3B8] truncate">
                        {activeTypingUsers.length > 0 ? (
                          <TypingWithPresence
                            status={
                              activeTypingAdminStatus ||
                              (activePartnerStatus &&
                              activePartnerStatus !== 'offline' &&
                              activePartnerStatus !== 'invisible'
                                ? activePartnerStatus
                                : null)
                            }
                            label={`${activeTypingUsers.join(', ')} typing`}
                          />
                        ) : activeConv.isGroup ? (
                          `${activeConv.participantIds.length} participants · tap to inspect`
                        ) : activePartnerStatus ? (
                          <PresenceBadge status={activePartnerStatus} size="xs" showLabel />
                        ) : activePartner?.lastActiveAt &&
                          !(activeOtherUid && adminPresenceMap[activeOtherUid]?.status === 'offline') ? (
                          `Last active ${formatRelativeTime(activePartner.lastActiveAt)} · ${cryptoStatus.protocol}`
                        ) : (
                          `Offline · ${cryptoStatus.protocol}`
                        )}
                      </div>
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void startCall('audio')}
                    aria-label="Voice call"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#141122] border border-white/[0.08] hover:border-[#8B5CF6]/50 text-[#E2E8F0] hover:text-white transition-colors"
                  >
                    <Phone size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void startCall('video')}
                    aria-label="Video call"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#141122] border border-white/[0.08] hover:border-[#8B5CF6]/50 text-[#E2E8F0] hover:text-white transition-colors"
                  >
                    <Video size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMessageSearch((v) => !v);
                      setMessageSearchTerm('');
                    }}
                    aria-label="Search messages"
                    className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border transition-colors ${
                      showMessageSearch
                        ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                        : 'bg-[#141122] border-white/[0.08] hover:border-[#8B5CF6]/50 text-[#E2E8F0]'
                    }`}
                  >
                    <Search size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowThreadInfo((v) => !v)}
                    aria-label="Conversation details"
                    className={`hidden xl:flex min-w-[40px] min-h-[40px] items-center justify-center rounded-xl border transition-colors ${
                      showThreadInfo
                        ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                        : 'bg-[#141122] border-white/[0.08] hover:border-[#8B5CF6]/50 text-[#E2E8F0]'
                    }`}
                  >
                    <Info size={16} />
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHeaderMenu((v) => !v)}
                      aria-label="Conversation options"
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#141122] border border-white/[0.08] hover:border-[#8B5CF6]/50 text-[#E2E8F0] hover:text-white transition-colors"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {showHeaderMenu && (
                      <div className="absolute right-0 mt-2 w-64 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-2 space-y-1 z-30">
                        <div className="px-3 py-2 text-[11px] text-[#94A3B8] border-b border-white/10 flex items-center gap-2">
                          <ShieldCheck size={14} className="text-[#A855F7] shrink-0" />
                          <span>{cryptoStatus.protocol} active</span>
                        </div>
                        {activeOtherUid ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShowHeaderMenu(false);
                              onOpenProfile(activeOtherUid);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                          >
                            <span>View User Profile</span>
                            <ExternalLink size={13} className="text-[#C084FC]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setShowHeaderMenu(false);
                              setShowMembersModal(true);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                          >
                            <span>View Group Participants</span>
                            <Users size={13} className="text-[#C084FC]" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            setShowHeaderMenu(false);
                            try {
                              await togglePinConversation(profile.uid, activeConv.id, userPrefs);
                            } catch (err) {
                              setChatError(
                                extractReadableErrorMessage(err, 'Unable to update pin state.')
                              );
                            }
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                        >
                          <span>
                            {pinnedSet.has(activeConv.id)
                              ? 'Unpin conversation'
                              : 'Pin conversation'}
                          </span>
                          <Pin size={13} className="text-[#C084FC]" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setShowHeaderMenu(false);
                            try {
                              await toggleMuteConversation(profile.uid, activeConv.id, userPrefs);
                            } catch (err) {
                              setChatError(
                                extractReadableErrorMessage(err, 'Unable to update mute settings.')
                              );
                            }
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                        >
                          <span>
                            {mutedSet.has(activeConv.id)
                              ? 'Unmute notifications'
                              : 'Mute conversation'}
                          </span>
                          <BellOff size={13} className="text-[#94A3B8]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            setModalError('');
                            setShowNewChat(true);
                          }}
                          className="w-full px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                        >
                          Start new DM or group thread
                        </button>
                        <div className="border-t border-white/10 pt-1 mt-1 space-y-1">
                          {activeOtherUid && (
                            <button
                              type="button"
                              onClick={() => void handleToggleBlockPartner()}
                              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-amber-300 hover:bg-amber-500/10 text-left"
                            >
                              <span>{activePartnerBlocked ? 'Unblock user' : 'Block user'}</span>
                              <Ban size={13} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setShowHeaderMenu(false);
                              setShowReportModal(true);
                            }}
                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs text-rose-300 hover:bg-rose-500/10 text-left"
                          >
                            <span>{activeOtherUid ? 'Report user' : 'Report conversation'}</span>
                            <Flag size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {safetyFeedback && (
                <div className="mx-4 mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2 text-xs text-emerald-200 flex items-center justify-between">
                  <span>{safetyFeedback}</span>
                  <button
                    type="button"
                    onClick={() => setSafetyFeedback('')}
                    className="text-emerald-300 hover:text-white"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {showMessageSearch && (
                <div className="px-4 sm:px-6 py-2.5 border-b border-white/[0.06] bg-[#0B0A13] flex items-center gap-3">
                  <Search size={14} className="text-[#A855F7] shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={messageSearchTerm}
                    onChange={(e) => setMessageSearchTerm(e.target.value)}
                    placeholder="Filter messages in this thread..."
                    className="flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#64748B]"
                  />
                  {messageSearchTerm && (
                    <span className="text-[11px] font-mono-tabular text-[#94A3B8]">
                      {visibleMessages.length} found
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowMessageSearch(false);
                      setMessageSearchTerm('');
                    }}
                    aria-label="Close message search"
                    className="p-1.5 text-[#94A3B8] hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Message Canvas */}
              <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 space-y-3.5">
                {visibleMessages.length === 0 && (
                  <p className="text-xs text-[#64748B] text-center py-10">
                    {messageSearchTerm
                      ? 'No messages matched your search.'
                      : 'Send the first message below.'}
                  </p>
                )}

                {visibleMessages.map((m) => {
                  const isMine = m.senderId === profile.uid;
                  const isRead = isMine && isMessageReadByOther(m, activeConv);
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`group relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 sm:px-4 py-2.5 space-y-1.5 shadow-sm ${
                          isMine
                            ? 'bg-gradient-to-br from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-white rounded-br-md'
                            : 'bg-[#141122] border border-white/[0.08] text-[#F1F5F9] rounded-bl-md'
                        }`}
                      >
                        {!isMine && (
                          <button
                            type="button"
                            onClick={() => onOpenProfile(m.senderId)}
                            className="text-[11px] font-semibold text-[#C084FC] hover:underline text-left inline-flex items-center gap-1.5"
                          >
                            <span>{m.senderName}</span>
                            <PresenceBadge
                              status={(() => {
                                const adminRec = adminPresenceMap[m.senderId];
                                return adminRec && adminRec.status !== 'offline'
                                  ? adminRec.status
                                  : null;
                              })()}
                              size="xs"
                            />
                          </button>
                        )}
                        {m.replyToText && (
                          <div className="px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[11px] text-white/80 truncate">
                            Replying to: {m.replyToText}
                          </div>
                        )}

                        {!m.deleted && m.type === 'image' && m.mediaUrl && (
                          <img
                            src={m.mediaUrl}
                            alt={m.fileName || 'Shared image'}
                            className="rounded-xl max-h-72 object-cover"
                          />
                        )}
                        {!m.deleted && m.type === 'video' && m.mediaUrl && (
                          <video src={m.mediaUrl} controls playsInline className="rounded-xl max-h-72" />
                        )}
                        {!m.deleted && m.type === 'voice' && m.mediaUrl && (
                          <audio src={m.mediaUrl} controls className="max-w-full" />
                        )}
                        {!m.deleted && m.type === 'document' && m.mediaUrl && (
                          <a
                            href={m.mediaUrl}
                            download={m.fileName || 'document'}
                            className="inline-flex items-center gap-2 text-xs text-white underline"
                          >
                            <FileText size={14} /> {m.fileName || 'Attachment'}
                          </a>
                        )}

                        {m.text && (
                          <p
                            className={`text-sm leading-relaxed break-words ${
                              m.deleted ? 'italic opacity-65' : ''
                            }`}
                          >
                            {m.text}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-3 text-[10px] text-white/75 pt-0.5">
                          <span className="inline-flex items-center gap-1 font-mono-tabular">
                            {formatRelativeTime(m.createdAt)}
                            {m.edited && !m.deleted ? ' · edited' : ''}
                            {isMine &&
                              !m.deleted &&
                              (isRead ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[#E9D5FF]"
                                  title="Read"
                                >
                                  <CheckCheck size={13} className="ml-0.5" aria-label="Read" />
                                  <span className="text-[9px]">Read</span>
                                </span>
                              ) : isMessageDelivered(m, activeConv) ? (
                                <span
                                  className="inline-flex items-center gap-0.5 text-white/75"
                                  title="Delivered"
                                >
                                  <CheckCheck size={12} className="ml-0.5" aria-label="Delivered" />
                                  <span className="text-[9px]">Delivered</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-0.5 text-white/60"
                                  title="Sent"
                                >
                                  <Check size={12} className="ml-0.5" aria-label="Sent" />
                                  <span className="text-[9px]">Sent</span>
                                </span>
                              ))}
                          </span>

                          {!m.deleted && (
                            <div className="opacity-90 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1.5 transition-opacity">
                              <button
                                type="button"
                                onClick={() =>
                                  setReactionPickerMsgId((cur) => (cur === m.id ? null : m.id))
                                }
                                aria-label="React"
                                className="p-1 hover:text-white"
                              >
                                <Smile size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setReplyTo(m)}
                                aria-label="Reply"
                                className="p-1 hover:text-white"
                              >
                                <Reply size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setForwardMsg(m)}
                                aria-label="Forward message"
                                className="p-1 hover:text-white"
                              >
                                <Forward size={13} />
                              </button>
                              {isMine && m.type === 'text' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingMsg(m);
                                    setMessageText(m.text);
                                  }}
                                  aria-label="Edit message"
                                  className="p-1 hover:text-white"
                                >
                                  <Edit3 size={13} />
                                </button>
                              )}
                              {isMine && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deleteChatMessage(activeConv.id, m.id).catch((err) =>
                                      setChatError(
                                        extractReadableErrorMessage(err, 'Unable to delete message.')
                                      )
                                    );
                                  }}
                                  aria-label="Delete message"
                                  className="p-1 hover:text-rose-200"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {reactionPickerMsgId === m.id && (
                          <div className="flex flex-wrap items-center gap-1 p-1.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/30 shadow-xl mt-1">
                            {QUICK_EMOJIS.map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => {
                                  void toggleMessageReaction(activeConv.id, m, profile.uid, em).catch(
                                    (err) =>
                                      setChatError(
                                        extractReadableErrorMessage(err, 'Unable to toggle reaction.')
                                      )
                                  );
                                  setReactionPickerMsgId(null);
                                }}
                                className="px-2 py-1 rounded hover:bg-white/10 text-sm"
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        )}

                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {Object.entries(m.reactions).map(([emoji, uids]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() =>
                                  void toggleMessageReaction(activeConv.id, m, profile.uid, emoji)
                                }
                                className="px-2 py-0.5 rounded-lg bg-black/35 text-[11px] font-mono-tabular"
                              >
                                {emoji} {uids.length}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {threadOutbox.map((draft) => (
                  <div key={draft.clientId} className="flex flex-col items-end">
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 space-y-1.5 ${
                        draft.status === 'failed'
                          ? 'bg-rose-950/60 border border-rose-500/40 text-rose-100'
                          : 'bg-[#7C3AED]/65 text-white'
                      }`}
                    >
                      <p className="text-sm leading-relaxed break-words">{draft.text}</p>
                      <div className="flex items-center justify-end gap-2 text-[10px]">
                        {draft.status === 'sending' ? (
                          <span className="inline-flex items-center gap-1 text-white/80">
                            <Clock size={11} /> Sending...
                          </span>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 text-rose-300">
                              <AlertCircle size={11} /> Failed to send
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPendingOutbox((prev) =>
                                  prev.map((it) =>
                                    it.clientId === draft.clientId
                                      ? { ...it, status: 'sending' }
                                      : it
                                  )
                                );
                                void dispatchOutboxMessage(draft);
                              }}
                              className="inline-flex items-center gap-1 font-semibold text-white underline"
                            >
                              <RefreshCw size={10} /> Retry
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingOutbox((prev) =>
                                  prev.filter((it) => it.clientId !== draft.clientId)
                                )
                              }
                              className="text-rose-200 hover:text-white"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {activeTypingUsers.length > 0 && (
                  <div className="flex items-start">
                    <div className="px-4 py-2 rounded-2xl bg-[#141122] border border-white/[0.08]">
                      <TypingWithPresence
                        status={
                          activeTypingAdminStatus ||
                          (activePartnerStatus &&
                          activePartnerStatus !== 'offline' &&
                          activePartnerStatus !== 'invisible'
                            ? activePartnerStatus
                            : null)
                        }
                        label={`${activeTypingUsers.join(', ')} is typing`}
                      />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form
                onSubmit={handleSendText}
                className="p-3 sm:p-4 border-t border-white/[0.07] bg-[#0D0B16] space-y-2.5 relative"
              >
                {activePartnerBlocked && (
                  <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                    <span>You blocked this user. Messages cannot be sent while blocked.</span>
                    <button
                      type="button"
                      onClick={() => void handleToggleBlockPartner()}
                      className="font-semibold text-white underline shrink-0"
                    >
                      Unblock
                    </button>
                  </div>
                )}

                {(replyTo || editingMsg) && (
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#7C3AED]/15 border border-[#8B5CF6]/25 text-xs text-[#E9D5FF]">
                    <span className="truncate">
                      {editingMsg
                        ? `Editing message: ${editingMsg.text}`
                        : `Replying to ${replyTo?.senderName}: ${replyTo?.text}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null);
                        setEditingMsg(null);
                        setMessageText('');
                      }}
                      className="p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                {recordingVoice && (
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200">
                    <span className="inline-flex items-center gap-2 font-medium font-mono-tabular">
                      <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                      Recording voice note ({String(Math.floor(voiceSeconds / 60)).padStart(2, '0')}:
                      {String(voiceSeconds % 60).padStart(2, '0')})
                    </span>
                    <button
                      type="button"
                      onClick={() => void toggleVoiceNote()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold text-[11px]"
                    >
                      <Square size={10} /> Stop &amp; Send
                    </button>
                  </div>
                )}

                {chatError && (
                  <FriendlyErrorBanner message={chatError} onDismiss={() => setChatError('')} />
                )}

                {showAttachMenu && (
                  <div className="absolute bottom-20 left-3 sm:left-4 w-52 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-1.5 space-y-1 z-30">
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                    >
                      <ImageIcon size={14} className="text-[#C084FC]" /> Upload Image
                    </button>
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                    >
                      <Video size={14} className="text-[#C084FC]" /> Upload Video
                    </button>
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                    >
                      <FileText size={14} className="text-[#C084FC]" /> Attach Document
                    </button>
                  </div>
                )}

                {showEmojiPicker && (
                  <div className="absolute bottom-20 left-3 sm:left-28 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-2 flex flex-wrap items-center gap-1.5 z-30">
                    {QUICK_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleMessageInput(`${messageText}${em}`)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-white/10 text-base"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => void handleAttachment(e, ['image'])}
                  className="hidden"
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={(e) => void handleAttachment(e, ['video'])}
                  className="hidden"
                />
                <input
                  ref={docInputRef}
                  type="file"
                  accept="application/pdf,text/plain"
                  onChange={(e) => void handleAttachment(e, ['document'])}
                  className="hidden"
                />

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => {
                      setShowAttachMenu((v) => !v);
                      setShowEmojiPicker(false);
                    }}
                    aria-label="Attachments"
                    className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-[#141122] border border-white/10 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white transition-colors shrink-0"
                  >
                    <Paperclip size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker((v) => !v);
                      setShowAttachMenu(false);
                    }}
                    aria-label="Emoji selector"
                    className="hidden sm:flex min-w-[42px] min-h-[42px] items-center justify-center rounded-xl bg-[#141122] border border-white/10 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white transition-colors shrink-0"
                  >
                    <Smile size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleVoiceNote()}
                    aria-label="Record voice note"
                    className={`min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl border transition-colors shrink-0 ${
                      recordingVoice
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-[#141122] border-white/10 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white'
                    }`}
                  >
                    <Mic size={16} />
                  </button>
                  <input
                    type="text"
                    maxLength={2000}
                    value={messageText}
                    onChange={(e) => handleMessageInput(e.target.value)}
                    placeholder={
                      uploadingMedia
                        ? 'Uploading...'
                        : recordingVoice
                        ? 'Recording voice...'
                        : 'Write a message...'
                    }
                    className="flex-1 min-w-0 px-3.5 sm:px-4 py-2.5 rounded-xl bg-[#08070F] border border-white/[0.1] focus:border-[#8B5CF6] outline-none text-sm text-white placeholder:text-[#64748B] min-h-[42px]"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || uploadingMedia || !messageText.trim()}
                    className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] hover:brightness-110 disabled:opacity-45 text-white inline-flex items-center justify-center gap-2 text-xs font-semibold transition-all min-h-[42px] shrink-0"
                  >
                    <Send size={15} />
                    <span className="hidden sm:inline">{editingMsg ? 'Update' : 'Send'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Optional Wide Desktop Right Conversation Details Rail */}
            {showThreadInfo && (
              <aside className="hidden xl:flex xl:w-[290px] shrink-0 border-l border-white/[0.07] bg-[#0D0B16] flex-col p-5 space-y-5 overflow-y-auto">
                <div className="text-center space-y-3 pt-2">
                  <div className="flex justify-center">
                    <CustomisedAvatar
                      src={getConvAvatar(activeConv)}
                      alt={getConvTitle(activeConv)}
                      sizeClass="w-16 h-16"
                      customisation={activePartner?.profileCustomisation}
                    />
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-bold text-white">
                      {getConvTitle(activeConv)}
                    </h3>
                    {activePartner && (
                      <p className="text-xs text-[#94A3B8]">@{activePartner.username}</p>
                    )}
                  </div>
                  <div className="flex justify-center gap-2">
                    {activeOtherUid ? (
                      <button
                        type="button"
                        onClick={() => onOpenProfile(activeOtherUid)}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white"
                      >
                        View Profile
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowMembersModal(true)}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-white"
                      >
                        Members ({activeConv.participantIds.length})
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#08070F] border border-white/[0.06] space-y-1.5 text-xs">
                  <p className="font-semibold text-white inline-flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-[#C084FC]" /> Security
                  </p>
                  <p className="text-[11px] text-[#94A3B8]">{cryptoStatus.protocol} active</p>
                </div>

                <div className="space-y-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      void togglePinConversation(profile.uid, activeConv.id, userPrefs)
                    }
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#08070F] hover:bg-white/[0.05] text-white"
                  >
                    <span>{pinnedSet.has(activeConv.id) ? 'Unpin thread' : 'Pin thread'}</span>
                    <Pin size={13} className="text-[#C084FC]" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void toggleMuteConversation(profile.uid, activeConv.id, userPrefs)
                    }
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#08070F] hover:bg-white/[0.05] text-white"
                  >
                    <span>{mutedSet.has(activeConv.id) ? 'Unmute alerts' : 'Mute alerts'}</span>
                    <BellOff size={13} className="text-[#94A3B8]" />
                  </button>
                  {activeOtherUid && (
                    <button
                      type="button"
                      onClick={() => void handleToggleBlockPartner()}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#08070F] hover:bg-amber-500/10 text-amber-300"
                    >
                      <span>{activePartnerBlocked ? 'Unblock user' : 'Block user'}</span>
                      <Ban size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#08070F] hover:bg-rose-500/10 text-rose-300"
                  >
                    <span>Report</span>
                    <Flag size={13} />
                  </button>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#7C3AED]/15 border border-[#8B5CF6]/30 flex items-center justify-center">
              <MessageSquarePlus size={26} className="text-[#C084FC]" />
            </div>
            <h2 className="font-display text-xl font-bold text-white">
              Select or start a conversation
            </h2>
            <p className="text-xs text-[#94A3B8] max-w-sm leading-relaxed">
              Send private direct messages, launch group threads, record voice notes, and start
              voice or video calls.
            </p>
            {chatError && <p className="text-xs text-rose-400 max-w-md">{chatError}</p>}
            <button
              type="button"
              onClick={() => {
                setModalError('');
                setShowNewChat(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-xs font-semibold text-white min-h-[42px]"
            >
              Start New Chat
            </button>
          </div>
        )}
      </section>

      {/* Group Participants Modal */}
      {showMembersModal && activeConv && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowMembersModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">
                Participants ({activeConv.participantIds.length})
              </h3>
              <button type="button" onClick={() => setShowMembersModal(false)} className="p-1.5">
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-2">
              {activeConv.participantIds.map((uid) => {
                const member = allKnownUsersMap.get(uid);
                const displayName =
                  member?.displayName || activeConv.participantNames?.[uid] || 'Member';
                const avatar = member?.avatarUrl || activeConv.participantAvatars?.[uid] || '';
                const memberStatus = getMemberBadgeStatus(uid, member);
                return (
                  <button
                    key={uid}
                    type="button"
                    onClick={() => {
                      setShowMembersModal(false);
                      onOpenProfile(uid);
                    }}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-[#06060A] border border-white/10 hover:border-[#8B5CF6] text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <ResilientImage
                          src={avatar}
                          alt={displayName}
                          className="w-9 h-9 rounded-full object-cover"
                        />
                        {memberStatus && (
                          <span className="absolute bottom-0 right-0">
                            <PresenceBadge status={memberStatus} size="xs" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1.5">
                          <span className="truncate">
                            {displayName} {uid === profile.uid ? '(You)' : ''}
                          </span>
                          {memberStatus && <PresenceBadge status={memberStatus} size="xs" />}
                        </p>
                        {member?.username && (
                          <p className="text-[11px] text-[#94A3B8] truncate">@{member.username}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-[#C084FC] font-medium shrink-0">
                      View Profile
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setForwardMsg(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">Forward Message</h3>
              <button type="button" onClick={() => setForwardMsg(null)}>
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={async () => {
                    try {
                      await forwardChatMessage({
                        targetConvId: c.id,
                        sender: profile,
                        original: forwardMsg,
                        recipientIds: c.participantIds,
                      });
                      setForwardMsg(null);
                      selectConversation(c.id);
                    } catch (err) {
                      setChatError(
                        extractReadableErrorMessage(err, 'Unable to forward message.')
                      );
                    }
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-[#06060A] border border-white/10 hover:border-[#8B5CF6] text-left min-h-[52px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ResilientImage
                      src={getConvAvatar(c)}
                      alt={getConvTitle(c)}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                    <span className="text-xs font-semibold text-white truncate">
                      {getConvTitle(c)}
                    </span>
                  </div>
                  <span className="text-xs text-[#C084FC]">Send</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* New Chat / Group Modal */}
      {showNewChat && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowNewChat(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 space-y-4 pb-safe"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">
                {groupMode ? 'New Group Chat' : 'Start Direct Message'}
              </h3>
              <button type="button" onClick={() => setShowNewChat(false)} className="p-1.5">
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>

            <div className="flex gap-2 p-1 bg-[#06060A] rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setGroupMode(false);
                  setSelectedMemberIds([]);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium min-h-[38px] ${
                  !groupMode
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                    : 'text-[#94A3B8]'
                }`}
              >
                Direct Message
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupMode(true);
                  setSelectedMemberIds([]);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 min-h-[38px] ${
                  groupMode
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                    : 'text-[#94A3B8]'
                }`}
              >
                <Users size={13} /> Group Chat
              </button>
            </div>

            {groupMode && (
              <input
                type="text"
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group chat name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 text-xs text-white outline-none"
              />
            )}

            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members by name or @username..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#06060A] border border-white/10 focus:border-[#8B5CF6] text-xs text-white outline-none"
            />

            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {otherUsers.length === 0 ? (
                <p className="text-xs text-[#64748B] py-4 text-center">
                  No matching members found yet.
                </p>
              ) : (
                otherUsers.map((u) => {
                  const picked = selectedMemberIds.includes(u.uid);
                  const memberStatus = getMemberBadgeStatus(u.uid, u);
                  return (
                    <div
                      key={u.uid}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
                        picked
                          ? 'bg-[#7C3AED]/20 border-[#8B5CF6]'
                          : 'bg-[#06060A] border-white/5 hover:border-white/15'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (groupMode) {
                            setSelectedMemberIds((prev) =>
                              prev.includes(u.uid)
                                ? prev.filter((id) => id !== u.uid)
                                : [...prev, u.uid]
                            );
                          } else {
                            setSelectedMemberIds([u.uid]);
                          }
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                      >
                        <div className="relative shrink-0">
                          <ResilientImage
                            src={u.avatarUrl}
                            alt={u.displayName}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                          {memberStatus && (
                            <span className="absolute bottom-0 right-0">
                              <PresenceBadge status={memberStatus} size="xs" />
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate inline-flex items-center gap-1.5">
                            <span className="truncate">{u.displayName}</span>
                            {memberStatus && <PresenceBadge status={memberStatus} size="xs" />}
                          </p>
                          <p className="text-[11px] text-[#94A3B8] truncate">@{u.username}</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewChat(false);
                            onOpenProfile(u.uid);
                          }}
                          title="Open user profile"
                          aria-label={`View ${u.displayName} profile`}
                          className="p-2 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/10"
                        >
                          <UserIcon size={14} />
                        </button>
                        {picked && <Check size={15} className="text-[#C084FC]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {modalError && <p className="text-xs text-rose-400">{modalError}</p>}

            <button
              type="button"
              disabled={selectedMemberIds.length === 0 || creatingConv}
              onClick={() => void handleCreateConversation()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] hover:brightness-110 disabled:opacity-40 text-xs font-semibold text-white min-h-[44px]"
            >
              {creatingConv ? 'Starting...' : 'Start Conversation'}
            </button>
          </div>
        </div>
      )}

      {/* Audio / Video Call Overlay */}
      {callState !== 'idle' && activeConv && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0E0C18] border border-[#8B5CF6]/30 rounded-2xl p-6 text-center space-y-5">
            <p className="text-xs font-semibold text-[#C084FC]">
              {callState === 'video' ? 'Video Call' : 'Voice Call'}
            </p>
            <h3 className="font-display text-xl font-bold text-white">
              {getConvTitle(activeConv)}
            </h3>
            {callState === 'video' ? (
              <video
                ref={localVideoRef}
                muted
                playsInline
                className="w-full aspect-video rounded-xl bg-black object-cover border border-white/10"
              />
            ) : (
              <div className="flex justify-center py-4">
                <ResilientImage
                  src={getConvAvatar(activeConv)}
                  alt={getConvTitle(activeConv)}
                  className="w-24 h-24 rounded-full object-cover border-2 border-[#8B5CF6]"
                />
              </div>
            )}
            <p className="font-mono-tabular text-sm text-[#CBD5E1]">
              {String(Math.floor(callSeconds / 60)).padStart(2, '0')}:
              {String(callSeconds % 60).padStart(2, '0')}
            </p>
            <button
              type="button"
              onClick={endCall}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-sm font-semibold text-white min-h-[44px]"
            >
              <PhoneOff size={16} /> End Call
            </button>
          </div>
        </div>
      )}

      {/* Report User / Conversation Modal */}
      {showReportModal && activeConv && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowReportModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmitChatReport}
            className="w-full max-w-md bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">
                {activeOtherUid ? 'Report Member' : 'Report Conversation'}
              </h3>
              <button type="button" onClick={() => setShowReportModal(false)} className="p-1">
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <p className="text-xs text-[#94A3B8]">
              Describe what happened so Nexora safety reviewers can investigate.
            </p>
            <textarea
              required
              maxLength={300}
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Explain why you are reporting this conversation..."
              className="w-full rounded-xl bg-[#06060A] border border-white/10 p-3 text-xs text-white placeholder:text-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="min-h-[42px] px-4 rounded-xl bg-white/10 text-xs font-medium text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reportBusy || !reportReason.trim()}
                className="min-h-[42px] px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white disabled:opacity-50"
              >
                {reportBusy ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
