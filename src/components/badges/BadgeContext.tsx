import React, { createContext, useContext, useState } from 'react';
import { VerifiedBadgeType } from '../../types/nexora';
import { normalizeBadgeType } from '../../utils/validation';

interface BadgeModalContextValue {
  selectedBadge: VerifiedBadgeType | null;
  isOpen: boolean;
  openBadgeModal: (badge?: string | null) => void;
  closeBadgeModal: () => void;
}

const BadgeModalContext = createContext<BadgeModalContextValue>({
  selectedBadge: null,
  isOpen: false,
  openBadgeModal: () => {},
  closeBadgeModal: () => {},
});

export function BadgeModalProvider({ children }: { children: React.ReactNode }) {
  const [selectedBadge, setSelectedBadge] = useState<VerifiedBadgeType | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openBadgeModal = (badge?: string | null) => {
    setSelectedBadge(badge ? normalizeBadgeType(badge) : 'verified_identity');
    setIsOpen(true);
  };

  const closeBadgeModal = () => {
    setIsOpen(false);
  };

  return (
    <BadgeModalContext.Provider value={{ selectedBadge, isOpen, openBadgeModal, closeBadgeModal }}>
      {children}
    </BadgeModalContext.Provider>
  );
}

export function useBadgeModal() {
  return useContext(BadgeModalContext);
}
