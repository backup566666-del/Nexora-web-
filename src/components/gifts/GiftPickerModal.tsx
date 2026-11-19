import React, { useEffect, useState } from 'react';
import { EyeOff, Gift, Send, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { subscribeGiftCatalog } from '../../services/firebase/adminService';
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

export function GiftPickerModal({
  open,
  onClose,
  recipient,
  targetType,
  targetId,
  onSent,
}: GiftPickerModalProps) {
  const { profile } = useAuth();
  const [catalog, setCatalog] = useState<VirtualGiftCatalogItem[]>(FREE_GIFT_CATALOG);
  const [selectedGiftId, setSelectedGiftId] = useState(FREE_GIFT_CATALOG[0].id);
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    return subscribeGiftCatalog((items) => {
      const enabled = items.filter((g) => g.enabled);
      setCatalog(enabled);
      if (enabled.length > 0 && !enabled.some((g) => g.id === selectedGiftId)) {
        setSelectedGiftId(enabled[0].id);
      }
    });
  }, [open, selectedGiftId]);

  if (!open || !profile) return null;

  const selectedGift = catalog.find((g) => g.id === selectedGiftId) || catalog[0];

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGift) return;
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
      onSent?.(selectedGift.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send virtual gift.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSend}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/30 shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#130F22]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center text-[#C084FC]">
              <Gift size={18} />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-white">
                Send Free Virtual Gift
              </h3>
              <p className="text-[11px] text-[#94A3B8]">
                Celebrate @{recipient.username} with a 100% free community token
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {catalog.map((gift) => {
              const selected = selectedGift?.id === gift.id;
              return (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => setSelectedGiftId(gift.id)}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                    selected
                      ? 'bg-[#1A1332] border-[#A855F7] shadow-[0_0_16px_rgba(168,85,247,0.28)]'
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
            })}
          </div>

          {selectedGift && (
            <div className="px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-[#8B5CF6]/20 flex items-center gap-2.5">
              <span className="text-xl">{selectedGift.emoji}</span>
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

          <label className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#08070F] border border-white/[0.06] cursor-pointer">
            <span className="inline-flex items-center gap-2 text-xs text-[#CBD5E1]">
              <EyeOff size={14} className="text-[#A855F7]" />
              Send anonymously (hide my name from public gift showcase)
            </span>
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              className="accent-[#8B5CF6]"
            />
          </label>

          {error && <p className="text-xs text-rose-400">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
              <Sparkles size={12} /> No coins or payments required
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs text-[#94A3B8] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || !selectedGift}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white disabled:opacity-50"
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
