import React, { useEffect, useState } from 'react';
import { Globe, Save, Sliders, Wrench } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { savePlatformConfig } from '../../../services/firebase/adminService';
import { extractReadableErrorMessage } from '../../../services/firebase/errorHandler';
import { PlatformConfig, PlatformRole, UserProfile } from '../../../types/nexora';

interface PlatformManagementPanelProps {
  actor: UserProfile;
  myRole: PlatformRole;
}

const FEATURE_LABELS: {
  key: keyof PlatformConfig['features'];
  label: string;
  description: string;
}[] = [
  {
    key: 'registrationOpen',
    label: 'Open User Registration',
    description: 'Allow new members to create Nexora accounts on the Auth screen.',
  },
  {
    key: 'communityApprovalRequired',
    label: 'Require Approval for New Spaces',
    description: 'Place newly created Spaces into Pending review until approved by staff.',
  },
  {
    key: 'vibesEnabled',
    label: 'Enable Vibes Section',
    description: 'Make short-form vertical video Vibes accessible in navigation.',
  },
  {
    key: 'spacesEnabled',
    label: 'Enable Spaces Section',
    description: 'Make community Spaces accessible across the desktop workspace.',
  },
  {
    key: 'chatEnabled',
    label: 'Enable Real-Time Chat',
    description: 'Allow direct and group messaging across Nexora.',
  },
  {
    key: 'storiesEnabled',
    label: 'Enable Ephemeral Stories',
    description: 'Show the 24-hour Stories rail at the top of the Home feed.',
  },
];

export function PlatformManagementPanel({ actor, myRole }: PlatformManagementPanelProps) {
  const { platformConfig } = useAuth();
  const [draft, setDraft] = useState<PlatformConfig>(platformConfig);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDraft(platformConfig);
  }, [platformConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      await savePlatformConfig({
        actor,
        actorRole: myRole.role,
        config: draft,
      });
      setFeedback({ type: 'ok', text: 'Global Nexora configuration published live.' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: extractReadableErrorMessage(err, 'Unable to save platform configuration.', { feature: 'admin:platform-config' }),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
            <Globe size={18} className="text-[#C084FC]" /> Platform Configuration & Toggles
          </h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Manage global Nexora branding, support contact, maintenance lock, content policy, and live feature switches.
          </p>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#6D28D9] via-[#7C3AED] to-[#9333EA] text-xs font-semibold text-white shadow-[0_4px_18px_rgba(124,58,237,0.35)] disabled:opacity-50"
        >
          <Save size={14} /> {busy ? 'Publishing...' : 'Publish Global Config'}
        </button>
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
          <button type="button" onClick={() => setFeedback(null)} className="text-white/70 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Identity & Contact */}
      <div className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4">
        <h3 className="font-display text-sm font-semibold text-white">
          Platform Identity & Support
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Platform Name</span>
            <input
              type="text"
              maxLength={60}
              required
              value={draft.platformName}
              onChange={(e) => setDraft((d) => ({ ...d, platformName: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Official Slogan</span>
            <input
              type="text"
              maxLength={120}
              required
              value={draft.slogan}
              onChange={(e) => setDraft((d) => ({ ...d, slogan: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Support Contact Email</span>
            <input
              type="email"
              maxLength={120}
              value={draft.supportEmail}
              onChange={(e) => setDraft((d) => ({ ...d, supportEmail: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#CBD5E1]">Logo Presentation Mode</span>
            <select
              value={draft.logoMode}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  logoMode: e.target.value as PlatformConfig['logoMode'],
                }))
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
            >
              <option value="standard">Standard Gradient Nexora Emblem</option>
              <option value="minimal">Minimal Compact Header</option>
              <option value="monochrome">Monochrome High-Contrast</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#CBD5E1]">Platform Summary Description</span>
          <textarea
            rows={2}
            maxLength={400}
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
          />
        </label>
      </div>

      {/* Maintenance Mode */}
      <div className="p-5 rounded-2xl bg-[#08070F] border border-amber-500/25 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
              <Wrench size={15} className="text-amber-300" /> Global Maintenance Mode
            </h3>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              When active, ordinary members see the maintenance notice while authorized Nexora staff keep full dashboard access.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-white">
            <input
              type="checkbox"
              checked={draft.maintenanceMode}
              onChange={(e) => setDraft((d) => ({ ...d, maintenanceMode: e.target.checked }))}
              className="accent-amber-500 w-4 h-4"
            />
            {draft.maintenanceMode ? 'ENABLED' : 'Off'}
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#CBD5E1]">Maintenance Banner Message</span>
          <input
            type="text"
            maxLength={300}
            value={draft.maintenanceMessage}
            onChange={(e) => setDraft((d) => ({ ...d, maintenanceMessage: e.target.value }))}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none"
          />
        </label>
      </div>

      {/* Feature Toggles */}
      <div className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-4">
        <h3 className="font-display text-sm font-semibold text-white flex items-center gap-2">
          <Sliders size={15} className="text-[#C084FC]" /> Live Module Feature Toggles
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FEATURE_LABELS.map((item) => {
            const active = draft.features[item.key];
            return (
              <label
                key={item.key}
                className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border cursor-pointer transition ${
                  active
                    ? 'bg-[#7C3AED]/10 border-[#8B5CF6]/35'
                    : 'bg-[#0D0B16] border-white/[0.06]'
                }`}
              >
                <div>
                  <span className="text-xs font-semibold text-white block">{item.label}</span>
                  <span className="text-[11px] text-[#94A3B8]">{item.description}</span>
                </div>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      features: { ...d.features, [item.key]: e.target.checked },
                    }))
                  }
                  className="accent-[#7C3AED] mt-1 shrink-0"
                />
              </label>
            );
          })}
        </div>
      </div>

      {/* Content Policy */}
      <div className="p-5 rounded-2xl bg-[#08070F] border border-[#8B5CF6]/20 space-y-3">
        <h3 className="font-display text-sm font-semibold text-white">
          Nexora Content & Safety Policy
        </h3>
        <textarea
          rows={4}
          maxLength={2000}
          value={draft.contentPolicy}
          onChange={(e) => setDraft((d) => ({ ...d, contentPolicy: e.target.value }))}
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0B16] border border-[#8B5CF6]/20 text-xs text-white outline-none leading-relaxed"
        />
      </div>
    </form>
  );
}
