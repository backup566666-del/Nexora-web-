import React, { useEffect, useState } from 'react';
import { CheckCircle2, Palette, Plus, Save, Trash2 } from 'lucide-react';
import {
  CustomisationCategory,
  CustomisationItem,
  SubscriptionTier,
  UserProfile,
} from '../../../types/nexora';
import { DEFAULT_CUSTOMISATION_CATALOG } from '../../../utils/validation';
import {
  deleteCustomisationCatalogItemAdmin,
  saveCustomisationCatalogItemAdmin,
  subscribeCustomisationCatalog,
} from '../../../services/firebase/customisationService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import { FriendlyErrorBanner } from '../../common/FriendlyErrorBanner';

interface AdminCustomisationCatalogPanelProps {
  actor: UserProfile;
  actorRole: string;
}

const CATEGORIES: CustomisationCategory[] = [
  'theme',
  'background',
  'accent',
  'gradient',
  'banner',
  'avatar_frame',
  'static_decoration',
  'animated_decoration',
  'effect',
  'layout',
];

export const AdminCustomisationCatalogPanel: React.FC<
  AdminCustomisationCatalogPanelProps
> = ({ actor, actorRole }) => {
  const [items, setItems] = useState<CustomisationItem[]>(DEFAULT_CUSTOMISATION_CATALOG);
  const [filterCat, setFilterCat] = useState<'all' | CustomisationCategory>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [newId, setNewId] = useState('');
  const [newCategory, setNewCategory] = useState<CustomisationCategory>('banner');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTier, setNewTier] = useState<SubscriptionTier>('plus');
  const [newPreviewValue, setNewPreviewValue] = useState(
    'linear-gradient(120deg, #2E1065 0%, #090712 60%, #4C1D95 100%)'
  );

  useEffect(() => {
    return subscribeCustomisationCatalog(setItems);
  }, []);

  const handleToggleItem = async (item: CustomisationItem, patch: Partial<CustomisationItem>) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyId(item.id);
    try {
      await saveCustomisationCatalogItemAdmin({
        actor,
        actorRole,
        item: { ...item, ...patch },
      });
      setStatusMsg(`Updated studio item "${item.name}".`);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not update customisation item.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    const id = (newId || `${newCategory}_${Date.now()}`).trim();
    setBusyId(id);
    try {
      await saveCustomisationCatalogItemAdmin({
        actor,
        actorRole,
        item: {
          id,
          category: newCategory,
          name: newName,
          description: newDescription,
          requiredTier: newTier,
          enabled: true,
          previewValue: newPreviewValue,
          animated: newCategory === 'animated_decoration' || newCategory === 'effect',
          sortOrder: items.length + 1,
        },
      });
      setNewId('');
      setNewName('');
      setNewDescription('');
      setStatusMsg('Added new customisation item to the Nexora Studio catalog.');
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not add studio catalog item.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteItem = async (item: CustomisationItem) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyId(item.id);
    try {
      await deleteCustomisationCatalogItemAdmin({ actor, actorRole, item });
      setStatusMsg(`Removed "${item.name}" override from custom catalog.`);
    } catch (err) {
      setErrorMsg(extractReadableErrorMessage(err, 'Could not remove catalog item.'));
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems =
    filterCat === 'all' ? items : items.filter((item) => item.category === filterCat);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/20 p-5 space-y-4">
        <div>
          <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
            <Palette size={17} className="text-[#C084FC]" />
            Profile Studio Customisation Catalog
          </h2>
          <p className="text-xs text-[#94A3B8] mt-1">
            Control availability and tier locks (Free, Plus, Pro) for Nexora themes, frames, rings, banners, and effects.
          </p>
        </div>

        <FriendlyErrorBanner message={errorMsg} onDismiss={() => setErrorMsg(null)} />
        {statusMsg && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-2.5 text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 size={14} /> {statusMsg}
          </div>
        )}

        {/* Category Filter */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filterCat === 'all' ? 'bg-[#7C3AED] text-white' : 'bg-[#120F1E] text-[#94A3B8]'
            }`}
          >
            All ({items.length})
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                filterCat === cat ? 'bg-[#7C3AED] text-white' : 'bg-[#120F1E] text-[#94A3B8]'
              }`}
            >
              {cat.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Catalog List */}
        <div className="divide-y divide-white/[0.06]">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{item.name}</span>
                  <span className="text-[10px] text-[#94A3B8] uppercase">
                    {item.category.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[11px] text-[#94A3B8]">{item.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={item.requiredTier}
                  disabled={busyId === item.id}
                  onChange={(e) =>
                    void handleToggleItem(item, {
                      requiredTier: e.target.value as SubscriptionTier,
                    })
                  }
                  className="min-h-[36px] px-2.5 rounded-lg bg-[#120F1E] border border-white/10 text-xs text-white"
                >
                  <option value="free">Free</option>
                  <option value="plus">Plus</option>
                  <option value="pro">Pro</option>
                </select>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void handleToggleItem(item, { enabled: !item.enabled })}
                  className={`min-h-[36px] px-3 rounded-lg font-semibold border ${
                    item.enabled
                      ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                      : 'bg-white/[0.05] border-white/10 text-[#94A3B8]'
                  }`}
                >
                  {item.enabled ? 'Enabled' : 'Disabled'}
                </button>
                {!DEFAULT_CUSTOMISATION_CATALOG.some((d) => d.id === item.id) && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void handleDeleteItem(item)}
                    className="min-h-[36px] px-2.5 rounded-lg bg-rose-500/15 border border-rose-400/30 text-rose-200"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Customisation Item */}
      <form
        onSubmit={handleAddItem}
        className="rounded-2xl bg-[#0D0B16] border border-[#8B5CF6]/15 p-5 space-y-4"
      >
        <h3 className="font-display text-sm font-bold text-white flex items-center gap-2">
          <Plus size={15} className="text-[#C084FC]" />
          Publish New Studio Asset
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] text-[#94A3B8]">Category</span>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as CustomisationCategory)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[#94A3B8]">Required Tier</span>
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value as SubscriptionTier)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            >
              <option value="free">Free</option>
              <option value="plus">Plus</option>
              <option value="pro">Pro</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[#94A3B8]">Unique Key ID (optional)</span>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="banner_nebula_gold"
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] text-[#94A3B8]">Display Name</span>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ultraviolet Horizon"
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-[#94A3B8]">Preview CSS / Hex / Token</span>
            <input
              type="text"
              required
              value={newPreviewValue}
              onChange={(e) => setNewPreviewValue(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] text-[#94A3B8]">Description</span>
          <input
            type="text"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Describe this style option for members."
            className="w-full min-h-[40px] px-3 rounded-xl bg-[#120F1E] border border-white/10 text-xs text-white"
          />
        </label>

        <button
          type="submit"
          disabled={Boolean(busyId)}
          className="min-h-[42px] px-5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#9333EA] text-xs font-semibold text-white inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={14} /> Add Studio Item
        </button>
      </form>
    </div>
  );
};
