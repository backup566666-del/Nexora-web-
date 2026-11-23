import React from 'react';
import { Crown, Sparkles, Award } from 'lucide-react';
import { ProfileCustomisation } from '../../types/nexora';
import { ResilientImage } from '../common/ResilientImage';

interface CustomisedAvatarProps {
  src?: string;
  alt: string;
  sizeClass?: string;
  customisation?: Partial<ProfileCustomisation> | null;
  className?: string;
}

export const CustomisedAvatar: React.FC<CustomisedAvatarProps> = ({
  src,
  alt,
  sizeClass = 'w-10 h-10',
  customisation,
  className = '',
}) => {
  const frameId = customisation?.avatarFrameId || 'frame_minimal';
  const staticDeco = customisation?.staticDecorationId || 'deco_none';
  const animatedDeco = customisation?.animatedDecorationId || 'anim_none';

  const frameStyles: Record<string, string> = {
    frame_minimal: 'ring-2 ring-white/15',
    frame_violet_halo: 'ring-2 ring-[#A855F7] shadow-[0_0_18px_rgba(168,85,247,0.45)]',
    frame_prism_bevel: 'p-[2px] bg-gradient-to-tr from-[#8B5CF6] via-[#EC4899] to-[#06B6D4]',
    frame_sovereign_crest: 'p-[2px] bg-gradient-to-tr from-[#F59E0B] via-[#FDE68A] to-[#8B5CF6] shadow-[0_0_18px_rgba(245,158,11,0.35)]',
  };

  const animRing =
    animatedDeco === 'anim_pulse_aura'
      ? 'after:content-[""] after:absolute after:-inset-1 after:rounded-full after:border after:border-[#A855F7]/60 after:animate-pulse after:pointer-events-none'
      : animatedDeco === 'anim_prism_orbit'
      ? 'after:content-[""] after:absolute after:-inset-1.5 after:rounded-full after:border-2 after:border-dashed after:border-[#C084FC]/70 after:animate-[spin_8s_linear_infinite] after:pointer-events-none'
      : animatedDeco === 'anim_stardust_halo'
      ? 'after:content-[""] after:absolute after:-inset-1.5 after:rounded-full after:border-2 after:border-dotted after:border-amber-400/80 after:animate-[spin_10s_linear_infinite] after:pointer-events-none'
      : '';

  const isGradientWrapper =
    frameId === 'frame_prism_bevel' || frameId === 'frame_sovereign_crest';

  return (
    <div className={`relative inline-flex items-center justify-center rounded-full shrink-0 ${animRing} ${className}`}>
      <div
        className={`rounded-full overflow-hidden ${sizeClass} ${
          frameStyles[frameId] || frameStyles.frame_minimal
        }`}
      >
        <ResilientImage
          src={src}
          alt={alt}
          className={`w-full h-full object-cover rounded-full ${
            isGradientWrapper ? 'bg-[#090712]' : ''
          }`}
        />
      </div>

      {staticDeco === 'deco_spark_crest' && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#120F1E] border border-[#A855F7]/60 flex items-center justify-center text-[#C084FC]"
        >
          <Sparkles size={9} />
        </span>
      )}
      {staticDeco === 'deco_botanical_arc' && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#120F1E] border border-sky-400/60 flex items-center justify-center text-sky-300"
        >
          <Award size={9} />
        </span>
      )}
      {staticDeco === 'deco_crown_pin' && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1 w-4 h-4 rounded-full bg-[#181209] border border-amber-400/70 flex items-center justify-center text-amber-300"
        >
          <Crown size={9} />
        </span>
      )}
    </div>
  );
};
