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
      className={`fixed inset-x-0 z-40 flex justify-center pointer-events-none px-2.5 sm:px-6 bottom-[max(0.9rem,calc(env(safe-area-inset-bottom)+0.6rem))] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-[150%] opacity-0'
      }`}
    >
      <nav
        aria-label="Primary navigation"
        className={`pointer-events-auto relative w-full max-w-[440px] sm:max-w-[540px] md:max-w-[590px] rounded-[28px] sm:rounded-[30px] bg-[#090612]/78 backdrop-blur-2xl border border-[#A855F7]/70 shadow-[0_14px_44px_rgba(3,2,10,0.88),0_0_26px_rgba(168,85,247,0.32),0_0_5px_rgba(216,180,254,0.45),inset_0_1px_0_rgba(255,255,255,0.14)] px-1.5 sm:px-3 py-1.5 sm:py-2 ${
          visible && !prefersReducedMotion ? 'nexora-dock-float' : ''
        }`}
      >
        {/* Subtle ambient neon top & outer edge sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-px rounded-[28px] sm:rounded-[30px] bg-gradient-to-r from-[#7C3AED]/15 via-[#C084FC]/25 to-[#7C3AED]/15 opacity-60 blur-[2px] -z-10"
        />

        <div className="relative flex items-end justify-between gap-0.5 sm:gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const isCenterNexora = item.id === 'create';

            if (isCenterNexora) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-label="Create with Nexora"
                  aria-current={active ? 'page' : undefined}
                  title="Create Post, Vibe or Story"
                  className="relative flex-[1.15] min-w-0 flex flex-col items-center justify-end gap-0.5 pb-1 pt-0.5 rounded-[20px] min-h-[54px] sm:min-h-[58px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C084FC] group"
                >
                  {active && (
                    <motion.span
                      layoutId={prefersReducedMotion ? undefined : 'nexora-dock-active-glow'}
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      aria-hidden="true"
                      className="absolute inset-0.5 rounded-[18px] bg-gradient-to-b from-[#9333EA]/40 via-[#7C3AED]/30 to-[#5B21B6]/40 border border-[#C084FC]/45 shadow-[0_0_22px_rgba(168,85,247,0.55),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    />
                  )}

                  {/* Center Prominent Illuminated Nexora N Medallion */}
                  <span className="relative flex items-center justify-center -mt-3 sm:-mt-3.5 transition-transform duration-200 group-hover:scale-105 group-active:scale-95">
                    <span
                      aria-hidden="true"
                      className={`absolute -inset-1.5 rounded-2xl bg-[radial-gradient(circle,rgba(192,132,252,0.55)_0%,rgba(124,58,237,0.28)_55%,transparent_75%)] blur-md ${
                        !prefersReducedMotion ? 'nexora-logo-aura' : ''
                      }`}
                    />
                    <span
                      className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center bg-gradient-to-b from-[#20113B]/95 via-[#130A26]/95 to-[#0B0617]/95 border transition-all duration-200 ${
                        active
                          ? 'border-[#E9D5FF] shadow-[0_0_26px_rgba(192,132,252,0.85),0_0_10px_rgba(168,85,247,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]'
                          : 'border-[#C084FC]/70 shadow-[0_0_20px_rgba(168,85,247,0.65),0_0_6px_rgba(192,132,252,0.45),inset_0_1px_0_rgba(255,255,255,0.24)] group-hover:border-[#E9D5FF]/90 group-hover:shadow-[0_0_26px_rgba(192,132,252,0.85)]'
                      }`}
                    >
                      <NexoraLogo variant="icon" size="sm" framed={false} />
                    </span>
                  </span>

                  <span
                    className={`relative z-10 text-[10px] sm:text-[11px] font-semibold tracking-tight leading-none whitespace-nowrap transition-colors ${
                      active ? 'text-white' : 'text-[#DDD6FE] group-hover:text-white'
                    }`}
                  >
                    Nexora
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
                className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 sm:py-2 px-1 rounded-[18px] min-h-[52px] sm:min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C084FC] group transition-colors"
              >
                {active && (
                  <motion.span
                    layoutId={prefersReducedMotion ? undefined : 'nexora-dock-active-glow'}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    aria-hidden="true"
                    className="absolute inset-0.5 rounded-[18px] bg-gradient-to-b from-[#9333EA]/55 via-[#7C3AED]/45 to-[#5B21B6]/55 border border-[#C084FC]/55 shadow-[0_0_20px_rgba(168,85,247,0.65),inset_0_1px_0_rgba(255,255,255,0.24)]"
                  />
                )}

                <span
                  className={`relative z-10 transition-all duration-200 group-hover:scale-105 group-active:scale-95 ${
                    active
                      ? 'text-white drop-shadow-[0_0_8px_rgba(216,180,254,0.85)]'
                      : 'text-[#A594C7] group-hover:text-white'
                  }`}
                >
                  <Icon size={19} strokeWidth={active ? 2.25 : 1.9} />
                  {item.id === 'chat' && unreadChatCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-emerald-400 text-[9px] font-bold text-[#06060A] flex items-center justify-center font-mono-tabular shadow-[0_0_8px_rgba(52,211,153,0.75)]">
                      {unreadChatCount > 9 ? '9+' : unreadChatCount}
                    </span>
                  )}
                </span>

                <span
                  className={`relative z-10 text-[10px] sm:text-[11px] font-medium tracking-tight leading-none whitespace-nowrap truncate max-w-full transition-colors ${
                    active
                      ? 'text-white font-semibold'
                      : 'text-[#94A3B8] group-hover:text-[#E2E8F0]'
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
