import React from 'react';
import { BadgeCheck } from 'lucide-react';

export function VerifiedBadge({ size = 15 }: { size?: number }) {
  return (
    <BadgeCheck
      size={size}
      className="inline-block shrink-0 text-[#A855F7]"
      aria-label="Verified account"
    />
  );
}
