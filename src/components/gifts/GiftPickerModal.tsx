import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { EyeOff, Gift, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { subscribeGiftCatalog } from '../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../services/firebase/errorHandler';
import { sendFreeVirtualGift } from '../../services/firebase/socialService';
import { VirtualGiftCatalogItem } from '../../types/nexora';
import { FREE_GIFT_CATALOG } from '../../utils/validation';

interface GiftPickerModalProps {
  open: boolean;
  onClose: () => void;
  recipient: { uid: string; displayName: string; username: string };
  targetType: 'profile' | 'post';
  targetId: string;
  onSent?: (giftName: string) => void;
}

const GIFT_CATEGORY_TABS: {
  id: 'all' | VirtualGiftCatalogItem['category'];
  label: string;
}[] = [
  { id: 'all', label: 'All Gifts' },
  { id: 'appreciation', label: 'Appreciation' },
  { id: 'celebration', label: 'Celebration' },
  { id: 'creator', label: 'Creator' },
  { id: 'community', label: 'Community' },
];

export function GiftPickerModal({
  open,
  onClose,
  recipient,
  targetType,
  targetId,
  onSent,
}: GiftPickerModalProps) {
  const { profile } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [catalog, setCatalog] = useState<VirtualGiftCatalogItem[]>(FREE_GIFT_CATALOG);
  const [categoryFilter, setCategoryFilter] =
    useState<'all' | VirtualGiftCatalogItem['category']>('all');
  const [selectedGiftId, setSelectedGiftId] = useState(FREE_GIFT_CATALOG[0].id);
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [celebratingGift, setCelebratingGift] = useState<VirtualGiftCatalogItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCelebratingGift(null);
      setError('');
      return;
    }
    return subscribeGiftCatalog((items) => {
      const enabled = items.filter((g) => g.enabled);
      setCatalog(enabled);
      if (enabled.length > 0 && !enabled.some((g) => g.id === selectedGiftId)) {
        setSelectedGiftId(enabled[0].id);
      }
    });
  }, [open, selectedGiftId]);

  const filteredCatalog = useMemo(() => {
    if (categoryFilter === 'all') return catalog;
    return catalog.filter((g) => g.category === categoryFilter);
  }, [catalog, categoryFilter]);

  if (!open || !profile) return null;

  const selectedGift =
    filteredCatalog.find((g) => g.id === selectedGiftId) ||
    catalog.find((g) => g.id === selectedGiftId) ||
    filteredCatalog[0] ||
    catalog[0];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGift || sending) return;
    setError('');
    setSending(true);
    try {
      await sendFreeVirtualGift({
        sender: profile,
        recipient,
        gift: selectedGift,
        targetType,
        targetId,
        message,
        anonymous,
      });
      setMessage('');
      setAnonymous(false);
      setCelebratingGift(selectedGift);
      onSent?.(selectedGift.name);
      window.setTimeout(() => {
        setCelebratingGift(null);
        onClose();
      }, prefersReducedMotion ? 700 : 1450);
    } catch (err) {
      setError(extractReadableErrorMessage(err, 'Unable to send virtual gift.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSend}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/30 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden pb-safe"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#130F22]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center text-[#C084FC] shrink-0">
              <Gift size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-sm font-bold text-white truncate">
                Send Free Virtual Gift
              </h3>
              <p className="text-[11px] text-[#94A3B8] truncate">
                Celebrate @{recipient.username} with a 100% free community token
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gift modal"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-white hover:bg-white/10 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <AnimatePresence>
          {celebratingGift && (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 z-30 bg-[#0D0B16]/95 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center space-y-4"
            >
              <motion.div
                initial={prefersReducedMotion ? {} : { scale: 0.4, rotate: -12 }}
                animate={prefersReducedMotion ? {} : { scale: [1.15, 1], rotate: [8, 0] }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl border shadow-2xl"
                style={{
                  backgroundColor: `${celebratingGift.accentColor}24`,
                  borderColor: `${celebratingGift.accentColor}88`,
                  boxShadow: `0 0 42px ${celebratingGift.accentColor}44`,
                }}
              >
                {celebratingGift.emoji}
              </motion.div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                  Free Gift Delivered
                </p>
                <h4 className="font-display text-xl font-bold text-white">
                  {celebratingGift.name} sent!
                </h4>
                <p className="text-xs text-[#CBD5E1]">
                  Delivered to @{recipient.username} with zero cost
                </p>
              </div>
              {!prefersReducedMotion && (
                <div className="flex items-center gap-3 text-xl" aria-hidden="true">
                  {['✨', celebratingGift.emoji, '💜', celebratingGift.emoji, '✨'].map(
                    (spark, idx) => (
                      <motion.span
                        key={idx}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: [0, 1, 0], y: -22 }}
                        transition={{ duration: 1.1, delay: idx * 0.08 }}
                      >
                        {spark}
                      </motion.span>
                    )
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-4 sm:p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Category Browsing */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {GIFT_CATEGORY_TABS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors min-h-[36px] ${
                  categoryFilter === cat.id
                    ? 'bg-gradient-to-r from-[#6D28D9] to-[#7C3AED] text-white'
                    : 'bg-[#08070F] border border-white/10 text-[#94A3B8] hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {filteredCatalog.length === 0 ? (
              <p className="col-span-full text-xs text-[#64748B] text-center py-6">
                No gifts in this category.
              </p>
            ) : (
              filteredCatalog.map((gift) => {
                const selected = selectedGift?.id === gift.id;
                return (
                  <button
                    key={gift.id}
                    type="button"
                    onClick={() => setSelectedGiftId(gift.id)}
                    style={
                      selected
                        ? {
                            borderColor: gift.accentColor,
                            boxShadow: `0 0 18px ${gift.accentColor}38`,
                          }
                        : undefined
                    }
                    className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 min-h-[96px] ${
                      selected
                        ? 'bg-[#1A1332]'
                        : 'bg-[#08070F] border-white/[0.06] hover:border-[#8B5CF6]/35'
                    }`}
                  >
                    <span className="text-2xl leading-none">{gift.emoji}</span>
                    <span className="text-[11px] font-semibold text-white leading-tight">
                      {gift.name}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
                      Free
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selectedGift && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 flex items-center gap-3">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border"
                style={{
                  backgroundColor: `${selectedGift.accentColor}1A`,
                  borderColor: `${selectedGift.accentColor}4D`,
                }}
              >
                {selectedGift.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">{selectedGift.name}</p>
                <p className="text-[11px] text-[#94A3B8]">{selectedGift.description}</p>
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] text-[#CBD5E1] block mb-1.5">
              Optional appreciation note
            </label>
            <input
              type="text"
              maxLength={240}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Write a kind note for ${recipient.displayName}...`}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 text-xs text-white outline-none focus:border-[#8B5CF6]"
            />
          </div>

          <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-white/[0.06] cursor-pointer min-h-[44px]">
            <span className="inline-flex items-center gap-2 text-xs text-[#CBD5E1]">
              <EyeOff size={14} className="text-[#A855F7] shrink-0" />
              Send anonymously (hide my name from public showcase)
            </span>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="accent-[#8B5CF6] w-4 h-4 shrink-0"
            />
          </label>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
              <Sparkles size={12} /> No coins or payments required
            </span>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs text-[#94A3B8] hover:text-white min-h-[42px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || !selectedGift}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white disabled:opacity-50 min-h-[42px]"
              >
                <Send size={13} /> {sending ? 'Sending...' : 'Send Free Gift'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
