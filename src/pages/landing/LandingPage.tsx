import React, { useState } from 'react';
import {
  Bookmark,
  Compass,
  Film,
  Heart,
  Home,
  Lock,
  MessageCircle,
  MessageSquare,
  Play,
  PlusSquare,
  Repeat2,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { NexoraLogo } from '../../components/branding/NexoraLogo';
import { ResilientImage } from '../../components/common/ResilientImage';
import { VerifiedBadge } from '../../components/common/VerifiedBadge';
import { submitContactSubmission } from '../../services/firebase/socialService';
import { ContactSubmission } from '../../types/nexora';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
}

type PhoneTab = 'home' | 'vibes' | 'chat' | 'spaces' | 'profile';

const FEATURE_SHORTCUTS: {
  id: PhoneTab;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: 'home', title: 'Home', desc: 'Your social feed.', icon: Home },
  { id: 'vibes', title: 'Vibes', desc: 'Short videos.', icon: Film },
  { id: 'chat', title: 'Chat', desc: 'Private and group messages.', icon: MessageSquare },
  { id: 'spaces', title: 'Spaces', desc: 'Communities.', icon: Compass },
  { id: 'profile', title: 'Profile', desc: 'Your space and identity.', icon: UserIcon },
];

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  const [phoneTab, setPhoneTab] = useState<PhoneTab>('home');
  const [likedDemoPost, setLikedDemoPost] = useState(false);
  const [savedDemoPost, setSavedDemoPost] = useState(false);
  const [activeModal, setActiveModal] = useState<'demo' | 'plans' | 'support' | null>(null);
  const [supportName, setSupportName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportCategory, setSupportCategory] = useState<ContactSubmission['category']>('support');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportFeedback, setSupportFeedback] = useState('');

  const handleNavClick = (target: 'home' | 'features' | 'spaces' | 'creators' | 'plans' | 'support') => {
    if (target === 'home') {
      setPhoneTab('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (target === 'features') {
      document.getElementById('feature-shortcuts')?.scrollIntoView({ behavior: 'smooth' });
    } else if (target === 'spaces') {
      setPhoneTab('spaces');
    } else if (target === 'creators') {
      setPhoneTab('vibes');
    } else if (target === 'plans') {
      setActiveModal('plans');
    } else if (target === 'support') {
      setActiveModal('support');
    }
  };

  return (
    <div className="min-h-screen bg-[#05040A] text-[#F8FAFC] flex flex-col relative overflow-x-hidden">
      {/* Atmospheric Deep Black & Dark Purple Radial Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_38%,rgba(109,40,217,0.22),rgba(59,7,100,0.12)_45%,rgba(5,4,10,1)_82%)]"
      />

      {/* 1. TOP HEADER */}
      <header className="relative z-30 border-b border-white/[0.08] bg-[#06050B]/80 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 h-20 flex items-center justify-between gap-8">
          {/* Far Left: Nexora Logo */}
          <button
            type="button"
            onClick={() => handleNavClick('home')}
            className="whitespace-nowrap shrink-0 focus-visible:outline-none"
          >
            <NexoraLogo size="md" theme="dark" />
          </button>

          {/* Centre: Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-8 text-sm font-medium text-[#CBD5E1]"
          >
            <button
              type="button"
              onClick={() => handleNavClick('home')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('features')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('spaces')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Spaces
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('creators')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Creators
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('plans')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Plans
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('support')}
              className="hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Support
            </button>
          </nav>

          {/* Right: Sign In & Get Started */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="px-4 py-2 text-sm font-medium text-[#E2E8F0] hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register')}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] hover:from-[#A855F7] hover:to-[#7C3AED] text-white text-sm font-semibold transition-all whitespace-nowrap shrink-0 shadow-[0_0_28px_rgba(139,92,246,0.4)]"
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* MAIN WIDE DESKTOP HERO COMPOSITION */}
      <main className="relative z-10 flex-1 flex flex-col justify-between max-w-[1440px] w-full mx-auto px-6 lg:px-12 pt-10 lg:pt-14 pb-8 gap-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-center">
          {/* 2. LEFT HERO + 5. FEATURE SHORTCUTS */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-5">
              <h1
                className="font-display font-bold tracking-tight text-white leading-[1.05]"
                style={{ fontSize: 'clamp(2.4rem, 3.8vw, 3.75rem)', textWrap: 'balance' }}
              >
                CONNECT. CREATE. SHARE. BELONG.
              </h1>

              <p className="text-base lg:text-[17px] text-[#CBD5E1] leading-relaxed max-w-lg">
                Nexora is the next-generation social network uniting real-time feeds, full-screen
                Vibes, private messaging, and visual Spaces inside one focused experience.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="px-7 py-3.5 rounded-xl bg-gradient-to-r from-[#8B5CF6] via-[#7C3AED] to-[#5B21B6] hover:from-[#A855F7] hover:to-[#6D28D9] text-white text-sm font-semibold transition-all shadow-[0_10px_34px_rgba(124,58,237,0.42)] whitespace-nowrap"
                >
                  Get Started Free
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('demo')}
                  className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] text-white text-sm font-medium transition-colors whitespace-nowrap"
                >
                  <Play size={15} className="text-[#C084FC]" />
                  Watch Demo
                </button>
              </div>
            </div>

            {/* 5. FEATURE SHORTCUTS (Horizontal Arrangement Underneath Hero Text) */}
            <div id="feature-shortcuts" className="pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {FEATURE_SHORTCUTS.map((item) => {
                  const Icon = item.icon;
                  const active = phoneTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPhoneTab(item.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        active
                          ? 'bg-[#7C3AED]/20 border-[#A855F7]/60 shadow-[0_0_24px_rgba(124,58,237,0.2)]'
                          : 'bg-[#0D0B16]/85 border-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <Icon
                        size={16}
                        className={active ? 'text-[#C084FC] mb-2' : 'text-[#94A3B8] mb-2'}
                      />
                      <p className="font-display text-xs font-semibold text-white">{item.title}</p>
                      <p className="text-[11px] text-[#94A3B8] leading-snug mt-0.5">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. CENTRE HERO: Sculpted 3D-Depth Purple-Gradient Nexora N Symbol */}
          <div className="lg:col-span-3 flex items-center justify-center py-6 lg:py-0">
            <div className="relative flex items-center justify-center">
              {/* Subtle Ambient Volumetric Lighting */}
              <div
                aria-hidden="true"
                className="absolute w-72 h-72 rounded-full bg-gradient-to-tr from-[#5B21B6]/45 via-[#8B5CF6]/30 to-[#C084FC]/20 blur-3xl"
              />
              {/* 3D Tilted Pedestal Frame & Illuminated Sculpted N */}
              <div
                className="relative p-7 rounded-[42px] bg-gradient-to-br from-[#1C1233]/90 via-[#0E091B]/95 to-[#06040C] border border-[#A855F7]/30 shadow-[0_32px_90px_rgba(88,28,135,0.55),inset_0_1px_1px_rgba(255,255,255,0.22)] transition-transform duration-500 hover:scale-[1.03]"
                style={{
                  transform: 'perspective(900px) rotateY(-8deg) rotateX(4deg)',
                }}
              >
                <div className="drop-shadow-[0_18px_36px_rgba(139,92,246,0.45)]">
                  <NexoraLogo variant="icon" size="hero" framed={false} className="w-44 h-44 lg:w-52 lg:h-52 [&>svg]:w-full [&>svg]:h-full" />
                </div>
              </div>
            </div>
          </div>

          {/* 4. RIGHT HERO: Realistic Smartphone Mockup Showcasing Nexora Mobile App */}
          <div className="lg:col-span-4 flex items-center justify-center lg:justify-end">
            <div className="relative w-[310px] sm:w-[330px] rounded-[46px] p-2.5 bg-gradient-to-b from-[#2E2744] via-[#171324] to-[#0B0912] border border-white/20 shadow-[0_32px_90px_rgba(0,0,0,0.85),0_0_60px_rgba(124,58,237,0.22)]">
              {/* Inner OLED Screen */}
              <div className="rounded-[38px] bg-[#07060C] overflow-hidden border border-white/10 flex flex-col h-[600px]">
                {/* Dynamic Island & Status */}
                <div className="px-6 pt-3 pb-2 flex items-center justify-between text-[10px] text-white/80 font-mono-tabular">
                  <span>9:41</span>
                  <div className="w-20 h-4 rounded-full bg-black border border-white/10" />
                  <span>5G</span>
                </div>

                {/* App Top Bar inside phone */}
                <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between">
                  <NexoraLogo size="xs" />
                  <span className="text-[11px] font-medium capitalize text-[#C084FC]">
                    {phoneTab}
                  </span>
                </div>

                {/* Phone Screen Content Area */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
                  {phoneTab === 'home' && (
                    <>
                      {/* Stories inside phone */}
                      <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                        {[
                          { name: 'You', img: '/src/assets/images/avatar_creator_one_1795066815825.jpg' },
                          { name: 'Elena', img: '/src/assets/images/space_cover_design_1795066814901.jpg' },
                          { name: 'Marcus', img: '/src/assets/images/space_cover_sound_1795066815582.jpg' },
                          { name: 'Aria', img: '/src/assets/images/space_cover_code_1795066815138.jpg' },
                        ].map((s) => (
                          <div key={s.name} className="shrink-0 flex flex-col items-center gap-1">
                            <div className="p-0.5 rounded-2xl bg-gradient-to-tr from-[#6D28D9] to-[#C084FC]">
                              <ResilientImage
                                src={s.img}
                                alt={s.name}
                                className="w-11 h-11 rounded-[13px] object-cover border border-[#07060C]"
                              />
                            </div>
                            <span className="text-[10px] text-[#CBD5E1]">{s.name}</span>
                          </div>
                        ))}
                      </div>

                      {/* Featured Post inside phone */}
                      <div className="p-3 rounded-2xl bg-[#100E1B] border border-white/[0.08] space-y-2.5">
                        <div className="flex items-center gap-2">
                          <ResilientImage
                            src="/src/assets/images/avatar_creator_one_1795066815825.jpg"
                            alt="Elena Vance"
                            className="w-7 h-7 rounded-lg object-cover"
                          />
                          <div>
                            <p className="text-[11px] font-semibold text-white inline-flex items-center gap-1">
                              Elena Vance <VerifiedBadge size={11} />
                            </p>
                            <p className="text-[10px] text-[#94A3B8]">@elena · 12m</p>
                          </div>
                        </div>
                        <p className="text-[11px] text-[#E2E8F0] leading-relaxed">
                          Night session inside the Spatial Design Collective. Building our new
                          interface language.
                        </p>
                        <div className="rounded-xl overflow-hidden aspect-[16/10] border border-white/10">
                          <ResilientImage
                            src="/src/assets/images/hero_nexora_workspace_1795066815506.jpg"
                            alt="Studio desk"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {/* Engagement Controls */}
                        <div className="flex items-center justify-between pt-1 text-[11px] text-[#94A3B8]">
                          <div className="flex items-center gap-3.5">
                            <button
                              type="button"
                              onClick={() => setLikedDemoPost((v) => !v)}
                              className={`inline-flex items-center gap-1 ${
                                likedDemoPost ? 'text-[#A855F7]' : 'hover:text-white'
                              }`}
                            >
                              <Heart
                                size={13}
                                className={likedDemoPost ? 'fill-[#A855F7]' : ''}
                              />
                              <span className="font-mono-tabular">
                                {likedDemoPost ? 143 : 142}
                              </span>
                            </button>
                            <span className="inline-flex items-center gap-1">
                              <MessageCircle size={13} />
                              <span className="font-mono-tabular">28</span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Repeat2 size={13} />
                              <span className="font-mono-tabular">19</span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSavedDemoPost((v) => !v)}
                            className={savedDemoPost ? 'text-[#A855F7]' : 'hover:text-white'}
                            aria-label="Save post"
                          >
                            <Bookmark
                              size={13}
                              className={savedDemoPost ? 'fill-[#A855F7]' : ''}
                            />
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {phoneTab === 'vibes' && (
                    <div className="relative h-full min-h-[420px] rounded-2xl overflow-hidden border border-white/10">
                      <ResilientImage
                        src="/src/assets/images/space_cover_sound_1795066815582.jpg"
                        alt="Vibes short video"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-transparent to-black/90 p-3.5 flex flex-col justify-between">
                        <div className="flex items-center gap-2">
                          <ResilientImage
                            src="/src/assets/images/avatar_creator_one_1795066815825.jpg"
                            alt="Marcus"
                            className="w-7 h-7 rounded-full object-cover"
                          />
                          <span className="text-xs font-semibold text-white inline-flex items-center gap-1">
                            Marcus Thorne <VerifiedBadge size={11} />
                          </span>
                        </div>
                        <div className="space-y-3">
                          <p className="text-[11px] text-white/90 text-right ml-auto max-w-[70%]">
                            Analog synth patches recorded live at midnight #soundlab
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-white border-t border-white/15 pt-2.5">
                            <span>Like</span>
                            <span>Comment</span>
                            <span>Repost</span>
                            <span>Save</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {phoneTab === 'chat' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-[#100E1B] border border-white/[0.08] flex items-center gap-2.5">
                        <ResilientImage
                          src="/src/assets/images/avatar_creator_one_1795066815825.jpg"
                          alt="Elena"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white">Elena Vance</p>
                          <p className="text-[10px] text-[#94A3B8] truncate">
                            Sent a voice note · 0:24
                          </p>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-[#141122] border border-white/10 text-[11px] text-[#E2E8F0] max-w-[85%]">
                        Just uploaded the final cover crops to the Space.
                      </div>
                      <div className="p-3 rounded-xl bg-[#5B21B6]/55 border border-[#8B5CF6]/40 text-[11px] text-white max-w-[85%] ml-auto">
                        Looks sharp. Joining the voice lounge in five!
                      </div>
                    </div>
                  )}

                  {phoneTab === 'spaces' && (
                    <div className="space-y-3">
                      {[
                        {
                          name: 'Spatial Design Collective',
                          img: '/src/assets/images/space_cover_design_1795066814901.jpg',
                          members: '2,480 members',
                        },
                        {
                          name: 'Midnight Sound Lab',
                          img: '/src/assets/images/space_cover_sound_1795066815582.jpg',
                          members: '1,920 members',
                        },
                      ].map((sp) => (
                        <div
                          key={sp.name}
                          className="relative rounded-2xl overflow-hidden aspect-[16/10] border border-white/10"
                        >
                          <ResilientImage
                            src={sp.img}
                            alt={sp.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-3 flex flex-col justify-end">
                            <p className="text-xs font-semibold text-white inline-flex items-center gap-1">
                              {sp.name} <VerifiedBadge size={11} />
                            </p>
                            <p className="text-[10px] text-[#CBD5E1] font-mono-tabular">
                              {sp.members}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {phoneTab === 'profile' && (
                    <div className="rounded-2xl bg-[#100E1B] border border-white/10 overflow-hidden">
                      <div className="h-20">
                        <ResilientImage
                          src="/src/assets/images/space_cover_code_1795066815138.jpg"
                          alt="Profile cover"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-3 flex gap-3 items-start">
                        <ResilientImage
                          src="/src/assets/images/avatar_creator_one_1795066815825.jpg"
                          alt="Profile avatar"
                          className="w-12 h-12 rounded-xl object-cover -mt-8 border-2 border-[#100E1B] shrink-0"
                        />
                        <div className="space-y-1 min-w-0">
                          <p className="text-xs font-bold text-white inline-flex items-center gap-1">
                            Elena Vance <VerifiedBadge size={11} />
                          </p>
                          <p className="text-[10px] text-[#94A3B8]">@elena · Berlin</p>
                          <div className="grid grid-cols-4 gap-1.5 pt-1 text-[10px] font-mono-tabular text-white">
                            <span>48p</span>
                            <span>12K</span>
                            <span>310</span>
                            <span>84K</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom App Navigation inside phone */}
                <div className="px-3 py-2.5 border-t border-white/[0.08] bg-[#0B0913] flex items-center justify-around">
                  {[
                    { id: 'home', icon: Home },
                    { id: 'vibes', icon: Film },
                    { id: 'spaces', icon: PlusSquare },
                    { id: 'chat', icon: MessageSquare },
                    { id: 'profile', icon: UserIcon },
                  ].map((nav) => {
                    const Icon = nav.icon;
                    const active = phoneTab === nav.id;
                    return (
                      <button
                        key={nav.id}
                        type="button"
                        onClick={() => setPhoneTab(nav.id as PhoneTab)}
                        aria-label={`Preview ${nav.id}`}
                        className={`p-1.5 rounded-lg transition-colors ${
                          active ? 'text-[#A855F7]' : 'text-[#64748B] hover:text-white'
                        }`}
                      >
                        <Icon size={16} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. BOTTOM BENEFITS STRIP */}
        <section className="pt-4 border-t border-white/[0.08]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#0B0914]/80 border border-white/[0.07]">
              <ShieldCheck size={20} className="text-[#A855F7] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-sm font-semibold text-white">Safe &amp; Private</h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">Your data, your control.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#0B0914]/80 border border-white/[0.07]">
              <Zap size={20} className="text-[#A855F7] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-sm font-semibold text-white">Fast &amp; Seamless</h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">A smooth, modern experience.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-[#0B0914]/80 border border-white/[0.07]">
              <Users size={20} className="text-[#A855F7] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-sm font-semibold text-white">For Everyone</h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Creators, communities and professionals.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Interactive Modals for Watch Demo, Plans, and Support */}
      {activeModal === 'demo' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-[#0D0B16] border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <NexoraLogo size="xs" />
                <span className="text-xs text-[#94A3B8]">Desktop Platform Walkthrough</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="text-[#94A3B8] hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video">
                <ResilientImage
                  src="/src/assets/images/hero_nexora_workspace_1795066815506.jpg"
                  alt="Nexora desktop environment"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent p-6 flex flex-col justify-end">
                  <p className="text-xs text-[#C084FC] font-medium">Live Firebase Workspace</p>
                  <h3 className="font-display text-xl font-bold text-white mt-1">
                    Home, Vibes, Create, Chat, Spaces, and Profile — unified on desktop.
                  </h3>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-[#94A3B8]">
                  Create a free verified account with Google or Email to enter the live workspace.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    onOpenAuth('register');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  Get Started Free
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'plans' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#0D0B16] border border-white/15 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-bold text-white">Nexora Access</h2>
              <button type="button" onClick={() => setActiveModal(null)}>
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-[#07060C] border border-white/10 space-y-3">
                <Sparkles size={18} className="text-[#A855F7]" />
                <h3 className="font-display text-base font-semibold text-white">Nexora Member</h3>
                <p className="text-2xl font-bold font-mono-tabular text-white">$0</p>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Full access to Home feed, Stories, Vibes, private &amp; group Chat, and joining
                  Spaces.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    onOpenAuth('register');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#7C3AED] text-xs font-semibold text-white"
                >
                  Get Started Free
                </button>
              </div>
              <div className="p-5 rounded-xl bg-[#07060C] border border-[#8B5CF6]/40 space-y-3">
                <Lock size={18} className="text-[#C084FC]" />
                <h3 className="font-display text-base font-semibold text-white">Creator &amp; Space Host</h3>
                <p className="text-2xl font-bold font-mono-tabular text-white">Included</p>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Launch public or private Spaces, host events &amp; voice rooms, customize covers,
                  and view Vibe analytics.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    onOpenAuth('register');
                  }}
                  className="w-full py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white"
                >
                  Create Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'support' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#0D0B16] border border-white/15 rounded-2xl p-6 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-display text-lg font-bold text-white">Support, Contact &amp; Security</h2>
              <button type="button" onClick={() => setActiveModal(null)}>
                <X size={18} className="text-[#94A3B8]" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-[#CBD5E1] leading-relaxed">
              <p>
                <strong className="text-white">Account Access:</strong> Sign in with Google or
                create an email account with Firebase verification. Use Forgot Password on the Sign
                In screen to recover access anytime.
              </p>
              <p>
                <strong className="text-white">Privacy Controls:</strong> Manage profile
                visibility, story audience, direct message permissions, and notification channels inside
                Settings once signed in.
              </p>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!supportName.trim() || !supportEmail.trim() || !supportSubject.trim() || !supportMessage.trim()) {
                  return;
                }
                setSupportSending(true);
                setSupportFeedback('');
                try {
                  await submitContactSubmission({
                    name: supportName,
                    email: supportEmail,
                    category: supportCategory,
                    subject: supportSubject,
                    message: supportMessage,
                  });
                  setSupportName('');
                  setSupportEmail('');
                  setSupportSubject('');
                  setSupportMessage('');
                  setSupportFeedback('Ticket submitted. Our Nexora Support team will respond shortly.');
                } catch (err) {
                  setSupportFeedback(
                    err instanceof Error ? err.message : 'Unable to send support request.'
                  );
                } finally {
                  setSupportSending(false);
                }
              }}
              className="pt-3 border-t border-white/10 space-y-3"
            >
              <p className="text-xs font-semibold text-white">Contact Support or Appeal an Account Issue</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={supportName}
                  onChange={(e) => setSupportName(e.target.value)}
                  placeholder="Your name"
                  className="px-3 py-2 rounded-xl bg-[#07060C] border border-white/10 text-xs text-white outline-none focus:border-[#8B5CF6]"
                />
                <input
                  type="email"
                  required
                  maxLength={120}
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  placeholder="Email address"
                  className="px-3 py-2 rounded-xl bg-[#07060C] border border-white/10 text-xs text-white outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={supportCategory}
                  onChange={(e) => setSupportCategory(e.target.value as ContactSubmission['category'])}
                  className="px-3 py-2 rounded-xl bg-[#07060C] border border-white/10 text-xs text-white outline-none focus:border-[#8B5CF6]"
                >
                  <option value="support">General Support</option>
                  <option value="appeal">Account Appeal</option>
                  <option value="verification_help">Badge & Verification Help</option>
                  <option value="bug">Report a Bug</option>
                  <option value="partnership">Official Partnership</option>
                </select>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={supportSubject}
                  onChange={(e) => setSupportSubject(e.target.value)}
                  placeholder="Subject"
                  className="px-3 py-2 rounded-xl bg-[#07060C] border border-white/10 text-xs text-white outline-none focus:border-[#8B5CF6]"
                />
              </div>
              <textarea
                rows={3}
                required
                maxLength={1500}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Describe your question, @username, or issue..."
                className="w-full p-3 rounded-xl bg-[#07060C] border border-white/10 text-xs text-white outline-none focus:border-[#8B5CF6] resize-none"
              />
              {supportFeedback && <p className="text-xs text-[#C084FC]">{supportFeedback}</p>}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    onOpenAuth('login');
                  }}
                  className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white"
                >
                  Sign In
                </button>
                <button
                  type="submit"
                  disabled={supportSending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#6D28D9] text-xs font-semibold text-white disabled:opacity-50"
                >
                  {supportSending ? 'Sending...' : 'Send Support Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
