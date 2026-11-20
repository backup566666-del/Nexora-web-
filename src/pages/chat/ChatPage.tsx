import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Edit3,
  ExternalLink,
  FileText,
  Forward,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
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
import { ResilientImage } from '../../components/common/ResilientImage';
import { BadgeStrip } from '../../components/common/VerifiedBadge';
import { useAuth } from '../../hooks/useAuth';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import {
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
  subscribeConversations,
  subscribeMessages,
  subscribeUserProfile,
  toggleMessageReaction,
} from '../../services/firebase/socialService';
import { uploadBlobAsset, uploadMediaAsset } from '../../services/storage/mediaUploadService';
import { ChatMessage, Conversation, Story, UserProfile } from '../../types/nexora';
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

const QUICK_EMOJIS = ['💜', '🔥', '👏', '😂', '😮', '🙌', '✨', '👍'];

export function ChatPage({ users, stories, initialConvId, onOpenProfile }: ChatPageProps) {
  const { profile, privateInfo, getUserBadges } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConvId || null);
  const [mobileShowThread, setMobileShowThread] = useState<boolean>(Boolean(initialConvId));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activePartner, setActivePartner] = useState<UserProfile | null>(null);

  // Left Panel Tabs & Search
  const [convFilter, setConvFilter] = useState<'all' | 'unread' | 'groups' | 'calls'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Right Panel Search, Menus & Composer
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [messageSearchTerm, setMessageSearchTerm] = useState('');
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
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

  // Modals: New DM / Group / Call
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

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === selectedConvId) || null,
    [conversations, selectedConvId]
  );

  const activeOtherUid = useMemo(() => {
    if (!activeConv || activeConv.isGroup || !profile?.uid) return null;
    return activeConv.participantIds.find((id) => id !== profile.uid) || null;
  }, [activeConv, profile?.uid]);

  // Live subscription to active DM partner profile (keeps online presence & avatar real-time)
  useEffect(() => {
    if (!activeOtherUid) {
      setActivePartner(null);
      return;
    }
    return subscribeUserProfile(activeOtherUid, setActivePartner);
  }, [activeOtherUid]);

  // Real-time messages subscription & read receipt sync
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

  // Clean up mic/camera streams if ChatPage unmounts
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

  const getOtherOnline = (c: Conversation) => {
    if (c.isGroup) return false;
    return isUserOnlineNow(getOtherPartnerProfile(c));
  };

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

  const getOtherTypingNames = (c: Conversation) => {
    if (!c.typingBy) return [];
    const now = Date.now();
    return Object.entries(c.typingBy)
      .filter(([uid, ts]) => uid !== profile.uid && now - (ts?.toMillis?.() ?? 0) < 7000)
      .map(([uid]) => c.participantNames?.[uid] || 'Someone');
  };

  const isMessageReadByOther = (m: ChatMessage, c: Conversation) => {
    if (!c.readBy || m.senderId !== profile.uid) return false;
    const msgTime = m.createdAt?.toMillis?.() ?? 0;
    if (!msgTime) return false;
    return c.participantIds.some(
      (id) => id !== profile.uid && (c.readBy?.[id]?.toMillis?.() ?? 0) >= msgTime
    );
  };

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = getConvTitle(c).toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (convFilter === 'unread') return isConversationUnread(c);
    if (convFilter === 'groups') return c.isGroup;
    return true;
  });

  const unreadConvCount = conversations.filter(isConversationUnread).length;

  const visibleMessages = messageSearchTerm.trim()
    ? messages.filter((m) => m.text.toLowerCase().includes(messageSearchTerm.toLowerCase()))
    : messages;

  const selectConversation = (convId: string) => {
    setSelectedConvId(convId);
    setMobileShowThread(true);
    setShowMessageSearch(false);
    setShowHeaderMenu(false);
    setChatError('');
    setReplyTo(null);
    setEditingMsg(null);
  };

  const handleMessageInput = (val: string) => {
    setMessageText(val);
    if (!activeConv) return;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    void setConversationTyping(activeConv.id, profile.uid, val.trim().length > 0);
    if (val.trim().length > 0) {
      typingTimeoutRef.current = window.setTimeout(() => {
        void setConversationTyping(activeConv.id, profile.uid, false);
      }, 3500);
    }
  };

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !messageText.trim() || sendingMsg) return;
    setChatError('');
    setSendingMsg(true);
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    void setConversationTyping(activeConv.id, profile.uid, false);
    try {
      if (editingMsg) {
        await editChatMessage(activeConv.id, editingMsg.id, messageText);
        setEditingMsg(null);
      } else {
        await sendChatMessage({
          convId: activeConv.id,
          sender: profile,
          type: 'text',
          text: messageText,
          replyToId: replyTo?.id,
          replyToText: replyTo?.text,
          recipientIds: activeConv.participantIds,
        });
        setReplyTo(null);
      }
      setMessageText('');
      setShowEmojiPicker(false);
    } catch (err) {
      setChatError(extractReadableErrorMessage(err, 'Failed sending message.'));
    } finally {
      setSendingMsg(false);
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

  const activeTypingUsers = activeConv ? getOtherTypingNames(activeConv) : [];
  const activePartnerOnline = activeConv ? getOtherOnline(activeConv) : false;

  return (
    <div className="h-[calc(100dvh-10.75rem)] md:h-[calc(100vh-11.25rem)] min-h-[380px] rounded-2xl border border-[#8B5CF6]/20 bg-[#0B0A13] overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-[0_20px_70px_rgba(0,0,0,0.65)]">
      {/* LEFT PANEL – CONVERSATIONS */}
      <aside
        className={`${
          mobileShowThread && activeConv ? 'hidden lg:flex' : 'flex'
        } lg:col-span-4 border-r border-[#8B5CF6]/15 bg-[#0D0B16] flex-col min-h-0`}
      >
        <div className="p-4 sm:p-5 border-b border-white/[0.08] space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg sm:text-xl font-bold text-white">Messages</h1>
              {unreadConvCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#7C3AED]/25 border border-[#8B5CF6]/40 text-[11px] font-mono-tabular font-semibold text-[#E9D5FF]">
                  {unreadConvCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setModalError('');
                setShowNewChat(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all whitespace-nowrap min-h-[42px]"
            >
              <Plus size={14} /> New Chat
            </button>
          </div>

          {/* Search Conversations */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C6E9B]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#06060A] border border-[#8B5CF6]/20 focus:border-[#8B5CF6] text-xs text-white placeholder:text-[#64748B] outline-none transition-colors min-h-[42px]"
            />
          </div>

          {/* Filter Tabs: All | Unread | Groups | Calls */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#06060A] border border-white/[0.07]">
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
                className={`py-2 rounded-lg text-[11px] sm:text-xs font-medium transition-colors whitespace-nowrap truncate px-1 min-h-[36px] ${
                  convFilter === t.id
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Active Stories Strip (Tap to Message or View Profile) */}
          {stories.length > 0 && convFilter !== 'calls' && (
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pt-1">
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

        {/* Conversations / Calls List */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05]">
          {convFilter === 'calls' ? (
            <div className="p-4 space-y-4">
              {callLogs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-[#94A3B8] px-1">Recent Session Calls</p>
                  {callLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-[#06060A] border border-white/[0.06] flex items-center justify-between gap-3"
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
                    Start a conversation to enable voice & video calls.
                  </p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl bg-[#06060A] border border-white/[0.06] flex items-center justify-between gap-3"
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
              const online = getOtherOnline(c);
              const unread = isConversationUnread(c);
              const typingNames = getOtherTypingNames(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`w-full px-4 sm:px-5 py-4 flex items-center gap-3.5 text-left transition-colors min-h-[72px] ${
                    selected
                      ? 'bg-gradient-to-r from-[#7C3AED]/20 to-transparent'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="relative shrink-0">
                    <ResilientImage
                      src={getConvAvatar(c)}
                      alt={getConvTitle(c)}
                      className="w-12 h-12 rounded-full object-cover border border-white/10"
                    />
                    {online && (
                      <span
                        title="Online"
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0D0B16]"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate inline-flex items-center gap-1.5">
                        <span className="truncate">{getConvTitle(c)}</span>
                        <BadgeStrip badges={getOtherBadges(c)} size={13} max={2} interactive={false} />
                      </p>
                      <span className="text-[11px] font-mono-tabular text-[#64748B] shrink-0">
                        {formatRelativeTime(c.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p
                        className={`text-xs truncate ${
                          typingNames.length > 0
                            ? 'text-[#C084FC] font-medium'
                            : unread
                            ? 'text-white font-medium'
                            : 'text-[#94A3B8]'
                        }`}
                      >
                        {typingNames.length > 0
                          ? `${typingNames[0]} is typing...`
                          : c.lastMessageText || 'Conversation started'}
                      </p>
                      {unread && (
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

      {/* RIGHT PANEL – ACTIVE CONVERSATION */}
      <section
        className={`${
          !mobileShowThread || !activeConv ? 'hidden lg:flex' : 'flex'
        } lg:col-span-8 flex-col min-h-0 bg-[#08070F]`}
      >
        {activeConv ? (
          <>
            {/* Active Conversation Header */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.08] bg-[#0D0B16] flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
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
                    if (activeOtherUid) {
                      onOpenProfile(activeOtherUid);
                    } else {
                      setShowMembersModal(true);
                    }
                  }}
                  className="flex items-center gap-3 min-w-0 text-left group"
                  title={activeOtherUid ? 'Open user profile' : 'View group participants'}
                >
                  <div className="relative shrink-0">
                    <ResilientImage
                      src={getConvAvatar(activeConv)}
                      alt={getConvTitle(activeConv)}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border border-[#8B5CF6]/40 group-hover:border-[#C084FC] transition-colors"
                    />
                    {activePartnerOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0D0B16]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-sm sm:text-base font-semibold text-white group-hover:text-[#C084FC] transition-colors truncate inline-flex items-center gap-1.5">
                      <span className="truncate">{getConvTitle(activeConv)}</span>
                      <BadgeStrip badges={getOtherBadges(activeConv)} size={14} max={3} />
                    </h2>
                    <p className="text-[11px] sm:text-xs text-[#94A3B8] truncate">
                      {activeTypingUsers.length > 0 ? (
                        <span className="text-[#C084FC] font-medium">
                          {activeTypingUsers.join(', ')} typing...
                        </span>
                      ) : activeConv.isGroup ? (
                        `${activeConv.participantIds.length} participants · tap to inspect`
                      ) : activePartnerOnline ? (
                        <span className="text-emerald-300">Online</span>
                      ) : activePartner?.lastActiveAt ? (
                        `Last active ${formatRelativeTime(activePartner.lastActiveAt)}`
                      ) : (
                        'Offline · tap to view profile'
                      )}
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {activeOtherUid && (
                  <button
                    type="button"
                    onClick={() => onOpenProfile(activeOtherUid)}
                    aria-label="View profile"
                    title="View Profile"
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#161423] border border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-xs font-medium text-[#E2E8F0] hover:text-white transition-colors min-h-[40px]"
                  >
                    <UserIcon size={14} className="text-[#C084FC]" />
                    <span>Profile</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void startCall('audio')}
                  aria-label="Voice call"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#161423] border border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-[#E2E8F0] hover:text-white transition-colors"
                >
                  <Phone size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void startCall('video')}
                  aria-label="Video call"
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#161423] border border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-[#E2E8F0] hover:text-white transition-colors"
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
                      : 'bg-[#161423] border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-[#E2E8F0]'
                  }`}
                >
                  <Search size={16} />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowHeaderMenu((v) => !v)}
                    aria-label="Conversation options"
                    className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#161423] border border-[#8B5CF6]/20 hover:border-[#8B5CF6] text-[#E2E8F0] hover:text-white transition-colors"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {showHeaderMenu && (
                    <div className="absolute right-0 mt-2 w-60 bg-[#0E0C18] border border-[#8B5CF6]/25 rounded-2xl shadow-2xl p-2 space-y-1 z-30">
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
                        onClick={() => {
                          setShowMessageSearch(true);
                          setShowHeaderMenu(false);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl text-xs text-white hover:bg-[#7C3AED]/15 text-left"
                      >
                        Search inside conversation
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
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* In-Thread Search Bar */}
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

            {/* MESSAGE AREA */}
            <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 sm:py-5 space-y-4">
              {visibleMessages.length === 0 && (
                <p className="text-xs text-[#64748B] text-center py-10">
                  {messageSearchTerm ? 'No messages matched your search.' : 'Send the first message below.'}
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
                      className={`group relative max-w-[88%] sm:max-w-[75%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 space-y-1.5 shadow-sm ${
                        isMine
                          ? 'bg-gradient-to-br from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-white rounded-br-md'
                          : 'bg-[#161423] border border-[#8B5CF6]/20 text-[#F1F5F9] rounded-bl-md'
                      }`}
                    >
                      {!isMine && (
                        <button
                          type="button"
                          onClick={() => onOpenProfile(m.senderId)}
                          className="text-[11px] font-semibold text-[#C084FC] hover:underline text-left"
                        >
                          {m.senderName}
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
                        <p className={`text-sm leading-relaxed break-words ${m.deleted ? 'italic opacity-65' : ''}`}>
                          {m.text}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-3 text-[10px] text-white/75 pt-0.5">
                        <span className="inline-flex items-center gap-1 font-mono-tabular">
                          {formatRelativeTime(m.createdAt)}
                          {m.edited && !m.deleted ? ' · edited' : ''}
                          {isMine && !m.deleted && (
                            isRead ? (
                              <CheckCheck size={13} className="text-[#E9D5FF] ml-0.5" aria-label="Read" />
                            ) : (
                              <Check size={12} className="text-white/60 ml-0.5" aria-label="Delivered" />
                            )
                          )}
                        </span>

                        {!m.deleted && (
                          <div className="opacity-90 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-2 transition-opacity">
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
                                    setChatError(extractReadableErrorMessage(err, 'Unable to delete message.'))
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

              {activeTypingUsers.length > 0 && (
                <div className="flex items-start">
                  <div className="px-4 py-2 rounded-2xl bg-[#161423] border border-[#8B5CF6]/20 text-xs text-[#C084FC]">
                    {activeTypingUsers.join(', ')} is typing...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* MESSAGE COMPOSER */}
            <form
              onSubmit={handleSendText}
              className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#0D0B16] space-y-2.5 relative"
            >
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
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                    Recording voice note ({String(Math.floor(voiceSeconds / 60)).padStart(2, '0')}:
                    {String(voiceSeconds % 60).padStart(2, '0')})
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleVoiceNote()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-semibold text-[11px]"
                  >
                    <Square size={10} /> Stop & Send
                  </button>
                </div>
              )}

              {chatError && <p className="text-xs text-rose-400">{chatError}</p>}

              {/* Attachment & Emoji Popovers */}
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

              <div className="flex items-center gap-1.5 sm:gap-2.5">
                <button
                  type="button"
                  disabled={uploadingMedia}
                  onClick={() => {
                    setShowAttachMenu((v) => !v);
                    setShowEmojiPicker(false);
                  }}
                  aria-label="Attachments"
                  className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-[#161423] border border-white/10 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white transition-colors shrink-0"
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
                  className="hidden sm:flex min-w-[42px] min-h-[42px] items-center justify-center rounded-xl bg-[#161423] border border-white/10 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white transition-colors shrink-0"
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
                      : 'bg-[#161423] border-white/10 hover:border-[#8B5CF6]/50 text-[#CBD5E1] hover:text-white'
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
                  className="flex-1 min-w-0 px-3.5 sm:px-4 py-2.5 rounded-xl bg-[#06060A] border border-[#8B5CF6]/20 focus:border-[#8B5CF6] outline-none text-sm text-white placeholder:text-[#64748B] min-h-[42px]"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || uploadingMedia || !messageText.trim()}
                  className="px-4 sm:px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] hover:brightness-110 disabled:opacity-45 text-white inline-flex items-center justify-center gap-2 text-xs font-semibold shadow-[0_4px_16px_rgba(124,58,237,0.35)] transition-all min-h-[42px] shrink-0"
                >
                  <Send size={15} />
                  <span className="hidden sm:inline">{editingMsg ? 'Update' : 'Send'}</span>
                </button>
              </div>
            </form>
          </>
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
                const displayName = member?.displayName || activeConv.participantNames?.[uid] || 'Member';
                const avatar = member?.avatarUrl || activeConv.participantAvatars?.[uid] || '';
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
                      <ResilientImage
                        src={avatar}
                        alt={displayName}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {displayName} {uid === profile.uid ? '(You)' : ''}
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
                      setChatError(extractReadableErrorMessage(err, 'Unable to forward message.'));
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
                  !groupMode ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white' : 'text-[#94A3B8]'
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
                  groupMode ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white' : 'text-[#94A3B8]'
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
                  const online = isUserOnlineNow(u);
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
                          {online && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#06060A]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{u.displayName}</p>
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
            <h3 className="font-display text-xl font-bold text-white">{getConvTitle(activeConv)}</h3>
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
    </div>
  );
}
