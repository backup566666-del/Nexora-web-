import React, { useEffect, useState } from 'react';
import { Gift, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import {
  adminDeleteGiftTransaction,
  saveGiftCatalogItem,
  subscribeAllGiftTransactionsAdmin,
  subscribeGiftCatalog,
} from '../../../services/firebase/adminService';
import {
  GiftTransaction,
  PlatformRole,
  UserProfile,
  VirtualGiftCatalogItem,
} from '../../../types/nexora';
import { formatRelativeTime } from '../../../utils/validation';

interface GiftModerationPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
}

const GIFT_CATEGORIES: VirtualGiftCatalogItem['category'][] = [
  'appreciation',
  'celebration',
  'creator',
  'community',
];

export function GiftModerationPanel({ actor, myRole }: GiftModerationPanelProps) {
  const [catalog, setCatalog] = useState<VirtualGiftCatalogItem[]>([]);
  const [transactions, setTransactions] = useState<GiftTransaction[]>([]);
  const [subTab, setSubTab] = useState<'catalog' | 'transactions'>('catalog');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Add new free gift state
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🎁');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] =
    useState<VirtualGiftCatalogItem['category']>('appreciation');
  const [newAccent, setNewAccent] = useState('#A855F7');

  useEffect(() => {
    const u1 = subscribeGiftCatalog(setCatalog);
    const u2 = subscribeAllGiftTransactionsAdmin(setTransactions);
    return () => {
      u1();
      u2();
    };
  }, []);

  const handleToggleEnabled = async (item: VirtualGiftCatalogItem) => {
    setBusy(true);
    setFeedback(null);
    try {
      await saveGiftCatalogItem({
        actor,
        actorRole: myRole.role,
        item: { ...item, tier: 'free', enabled: !item.enabled },
      });
      setFeedback({
        type: 'ok',
        text: `${item.name} is now ${!item.enabled ? 'enabled' : 'disabled'} in the free gift catalog.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update gift catalog item.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDescription.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const slug = newName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      const item: VirtualGiftCatalogItem = {
        id: `gift_${slug || Date.now()}`,
        name: newName.trim(),
        emoji: newEmoji.trim() || '🎁',
        description: newDescription.trim(),
        category: newCategory,
        accentColor: newAccent,
        tier: 'free',
        enabled: true,
        sortOrder: catalog.length + 1,
      };
      await saveGiftCatalogItem({
        actor,
        actorRole: myRole.role,
        item,
      });
      setNewName('');
      setNewDescription('');
      setNewEmoji('🎁');
      setFeedback({ type: 'ok', text: `Added free gift "${item.name}" to catalog.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save free gift.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTx = async (tx: GiftTransaction) => {
    setBusy(true);
    setFeedback(null);
    try {
      await adminDeleteGiftTransaction({
        actor,
        actorRole: myRole.role,
        giftTx: tx,
      });
      setFeedback({ type: 'ok', text: `Removed gift transaction from @${tx.recipientUsername}.` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to remove gift transaction.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Gift size={18} className="text-[#C084FC]" /> Free Virtual Gifting &amp; Catalog
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Manage Nexora&apos;s strictly free virtual gift catalog (zero coins, prices, or purchases) and moderate recent gift notes.
          </p>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-[#08070F] border border-white/10 self-start">
          <button
            type="button"
            onClick={() => setSubTab('catalog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === 'catalog' ? 'bg-[#7C3AED] text-white' : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Gift Catalog ({catalog.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('transactions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              subTab === 'transactions'
                ? 'bg-[#7C3AED] text-white'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            Recent Gifts ({transactions.length})
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-white/70 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {subTab === 'catalog' ? (
        <div className="space-y-6">
          <form
            onSubmit={handleAddGift}
            className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
                <Plus size={15} className="text-[#C084FC]" /> Add Free Virtual Gift
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                <Sparkles size={11} /> Strictly Free Tier Only
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-[#CBD5E1]">Gift Name</span>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Aurora Star"
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Emoji</span>
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white text-center outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Category</span>
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as VirtualGiftCatalogItem['category'])
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none capitalize"
                >
                  {GIFT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <label className="block space-y-1 sm:col-span-3">
                <span className="text-xs font-medium text-[#CBD5E1]">Description</span>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Short celebration message displayed in gift picker..."
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#CBD5E1]">Accent Hex</span>
                <input
                  type="text"
                  maxLength={20}
                  value={newAccent}
                  onChange={(e) => setNewAccent(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white font-mono-tabular outline-none"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={busy || !newName.trim() || !newDescription.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white disabled:opacity-40"
            >
              <Save size={13} /> Save Free Gift
            </button>
          </form>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {catalog.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shrink-0 border"
                    style={{
                      backgroundColor: `${item.accentColor}1A`,
                      borderColor: `${item.accentColor}4D`,
                    }}
                  >
                    {item.emoji}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-semibold uppercase">
                        Free
                      </span>
                    </div>
                    <p className="text-[11px] text-[#94A3B8] truncate">{item.description}</p>
                    <p className="text-[10px] text-[#64748B] capitalize mt-0.5">
                      {item.category} • Order #{item.sortOrder}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggleEnabled(item)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 border ${
                    item.enabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25'
                      : 'bg-white/5 border-white/15 text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06]">
            <h3 className="font-display text-sm font-semibold text-white">
              Recent Free Virtual Gifts ({transactions.length})
            </h3>
          </div>
          {transactions.length === 0 ? (
            <p className="p-6 text-xs text-[#64748B]">No virtual gifts have been sent yet.</p>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl shrink-0">{tx.giftEmoji}</span>
                    <div className="min-w-0">
                      <p className="text-white font-medium">
                        {tx.giftName}{' '}
                        <span className="text-[#94A3B8] font-normal">
                          from {tx.anonymous ? 'Anonymous (Admin ID: ' + tx.senderUsername + ')' : '@' + tx.senderUsername} →{' '}
                          <span className="text-[#C084FC]">@{tx.recipientUsername}</span>
                        </span>
                      </p>
                      {tx.message && (
                        <p className="text-[#CBD5E1] mt-1 bg-[#0D0B16] px-2.5 py-1.5 rounded-lg border border-white/[0.06]">
                          &ldquo;{tx.message}&rdquo;
                        </p>
                      )}
                      <p className="text-[10px] text-[#64748B] mt-1">
                        Target: {tx.targetType} ({tx.targetId}) • {formatRelativeTime(tx.createdAt)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteTx(tx)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs text-rose-300 shrink-0 self-start sm:self-center"
                  >
                    <Trash2 size={12} /> Remove Gift
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
