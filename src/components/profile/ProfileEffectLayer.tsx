import React from 'react';
import { DEFAULT_CUSTOMISATION_CATALOG } from '../../utils/validation';
import { CustomisationItem, ProfileCustomisation } from '../../types/nexora';

export function resolveBannerBackground(
  customisation?: Partial<ProfileCustomisation> | null,
  catalog: CustomisationItem[] = DEFAULT_CUSTOMISATION_CATALOG
): { imageUrl?: string; cssBackground: string } {
  if (customisation?.bannerImageUrl) {
    return {
      imageUrl: customisation.bannerImageUrl,
      cssBackground: 'linear-gradient(120deg, #1E1338 0%, #0D0B16 100%)',
    };
  }
  const preset = catalog.find((c) => c.id === customisation?.bannerPresetId);
  return {
    cssBackground:
      preset?.previewValue ||
      'linear-gradient(120deg, #1E1338 0%, #0D0B16 60%, #241242 100%)',
  };
}

export function resolveGradientStyle(
  customisation?: Partial<ProfileCustomisation> | null,
  catalog: CustomisationItem[] = DEFAULT_CUSTOMISATION_CATALOG
): string | undefined {
  if (!customisation?.gradientId || customisation.gradientId === 'grad_none') return undefined;
  const item = catalog.find((c) => c.id === customisation.gradientId);
  if (!item || item.previewValue === 'none') return undefined;
  return item.previewValue;
}

export const ProfileEffectLayer: React.FC<{
  effectId?: string;
}> = ({ effectId }) => {
  if (!effectId || effectId === 'effect_none') return null;

  if (effectId === 'effect_aurora') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      >
        <div
          className="absolute -top-24 -left-16 w-80 h-80 rounded-full opacity-25 blur-3xl animate-pulse"
          style={{ background: 'radial-gradient(circle, #A855F7 0%, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-24 right-0 w-72 h-72 rounded-full opacity-20 blur-3xl animate-pulse"
          style={{ background: 'radial-gradient(circle, #38BDF8 0%, transparent 70%)' }}
        />
      </div>
    );
  }

  if (effectId === 'effect_starlight') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(1.5px 1.5px at 14% 24%, rgba(251,191,36,0.9) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 38% 18%, rgba(233,213,255,0.85) 50%, transparent 100%), radial-gradient(2px 2px at 66% 28%, rgba(251,191,36,0.8) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 84% 22%, rgba(192,132,252,0.9) 50%, transparent 100%), radial-gradient(1.5px 1.5px at 52% 62%, rgba(255,255,255,0.75) 50%, transparent 100%)',
        }}
      />
    );
  }

  if (effectId === 'effect_prism') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background:
              'linear-gradient(115deg, transparent 20%, rgba(168,85,247,0.45) 45%, rgba(56,189,248,0.35) 55%, transparent 80%)',
          }}
        />
      </div>
    );
  }

  return null;
};
