import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { NexoraLogo } from '../branding/NexoraLogo';
import { NavSection } from '../../types/nexora';

export interface FloatingDockItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}

interface FloatingBottomDockProps {
  items: FloatingDockItem[];
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  unreadChatCount?: number;
  visible: boolean;
}

export function FloatingBottomDock({
  items,
  activeSection,
  onNavigate,
  unreadChatCount = 0,
  visible,
}: FloatingBottomDockProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className={`lg:hidden fixed inset-x-0 z-40 flex justify-center pointer-events-none px-2.5 bottom-[max(0.4rem,env(safe-area-inset-bottom))] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-[145%] opacity-0'
      }`}
    >
      <nav
        aria-label="Mobile navigation"
        className="pointer-events-auto relative w-full max-w-[460px] rounded-2xl bg-[#090713]/92 backdrop-blur-2xl border border-[#8B5CF6]/45 shadow-[0_12px_36px_rgba(3,2,10,0.9),0_0_18px_rgba(124,58,237,0.22)] px-1.5 py-1"
      >
        <div className="relative flex items-center justify-between gap-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const isCreate = item.id === 'create';

            if (isCreate) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-label="Create with Nexora"
                  aria-current={active ? 'page' : undefined}
                  title="Create Post, Vibe or Story"
                  className="relative flex-1 min-w-[46px] min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C084FC] group"
                >
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#6D28D9] to-[#9333EA] border transition-all duration-200 ${
                      active
                        ? 'border-[#E9D5FF] shadow-[0_0_18px_rgba(192,132,252,0.7)] scale-105'
                        : 'border-[#C084FC]/60 shadow-[0_0_12px_rgba(124,58,237,0.45)] group-hover:scale-105'
                    }`}
                  >
                    <NexoraLogo variant="icon" size="xs" framed={false} />
                  </span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className="relative flex-1 min-w-[46px] min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C084FC] group transition-colors"
              >
                {active && (
                  <motion.span
                    layoutId={prefersReducedMotion ? undefined : 'nexora-mobile-dock-pill'}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    aria-hidden="true"
                    className="absolute inset-0.5 rounded-xl bg-[#7C3AED]/25 border border-[#A855F7]/45"
                  />
                )}

                <span
                  className={`relative z-10 transition-colors ${
                    active ? 'text-white' : 'text-[#94A3B8] group-hover:text-white'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.25 : 1.9} />
                  {item.id === 'chat' && unreadChatCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-emerald-400 text-[9px] font-bold text-[#06060A] flex items-center justify-center font-mono-tabular">
                      {unreadChatCount > 9 ? '9+' : unreadChatCount}
                    </span>
                  )}
                </span>

                <span
                  className={`relative z-10 text-[10px] tracking-tight leading-none whitespace-nowrap truncate max-w-full ${
                    active ? 'text-white font-semibold' : 'text-[#94A3B8] font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
