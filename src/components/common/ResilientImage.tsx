import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../../assets/defaultAssets';

interface ResilientImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackLabel?: string;
}

export function ResilientImage({
  src,
  alt,
  className = '',
  style,
  fallbackLabel,
}: ResilientImageProps) {
  const resolvedSrc = resolveAssetUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (!resolvedSrc || failed) {
    const initial = (fallbackLabel || alt || 'N').trim().charAt(0).toUpperCase();
    return (
      <div
        role="img"
        aria-label={alt}
        style={style}
        className={`flex items-center justify-center bg-gradient-to-br from-[#2E1065] via-[#131320] to-[#06060A] text-white/80 font-display font-semibold select-none ${className}`}
      >
        <span>{initial}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={style}
      className={className}
    />
  );
}
