/**
 * Landing page — MIA-inspired design system
 * Lavender canvas · Dark rounded dark sections · Pill CTAs · FAQ accordion
 * Full multilingual support with dynamic navbar language dropdown
 */
import {
  ArrowUpRight, ChevronDown, ChevronUp, FileText, Languages as LanguagesIcon,
  MessageCircle, SearchCheck, ShieldCheck, Sparkles, Star, UserRoundCheck, Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/app';

/* ─────────────────────────────────────────────────────────────────
   DESIGN TOKENS  (MIA-faithful)
   Canvas:  #F4F4FE   Dark surface: #131416   Brand: #4338CA
   ───────────────────────────────────────────────────────────────── */
const C = {
  canvas:  '#F4F4FE',
  dark:    '#131416',
  darkEl:  '#1C1E22',
  brand:   '#4338CA',
  brandLt: '#EDE9FE',
  teal:    '#0D9488',
  muted:   '#4B5162',
  border:  '#E5E7EB',
  darkBorder: 'rgba(255,255,255,0.08)',
  darkText:   '#A0A5B5',
};

/* ═══ Shared primitives ═══════════════════════════════════════════ */

/** Primary pill button with circular arrow badge — MIA signature CTA */
function PillCTA({
  children, onClick, disabled, secondary = false, testId,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  testId?: string;
}) {
  return secondary ? (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  ) : (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="group inline-flex items-center gap-3 rounded-full px-5 py-3 text-base font-bold text-white transition disabled:opacity-50"
      style={{ background: C.brand }}
    >
      {children}
      {/* Circular arrow badge — MIA signature */}
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition group-hover:bg-white/30">
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </button>
  );
}

/** Trust / social proof badge pill */
function TrustBadge({ stars, label }: { stars?: boolean; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2 shadow-sm" style={{ borderColor: C.border }}>
      {stars && (
        <span className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          ))}
        </span>
      )}
      <span className="text-sm font-semibold text-slate-700">{label}</span>
    </div>
  );
}

/** Tag pill used in section headers */
function TagPill({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold"
      style={{ background: C.brandLt, color: C.brand }}
    >
      {label}
    </span>
  );
}

/** Floating decoration card — hero isometric icons */
function FloatCard({
  emoji, label, style, rotate = -8,
}: { emoji: string; label: string; style: React.CSSProperties; rotate?: number }) {
  return (
    <div
      aria-hidden
      className="decor pointer-events-none absolute select-none"
      style={style}
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-xl text-3xl"
        style={{ transform: `rotate(${rotate}deg)` }}
      >
        {emoji}
      </div>
      <span
        className="mt-1.5 block rounded-full bg-white/90 px-2 py-0.5 text-center text-[11px] font-bold shadow"
        style={{ color: C.brand }}
      >
        {label}
      </span>
    </div>
  );
}

/** Dark pillar feature card */
function PillarCard({
  icon: Icon, title, desc, accentColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  accentColor: string;
}) {
  return (
    <div
      className="rounded-2xl p-6 transition hover:scale-[1.01]"
      style={{ background: C.darkEl, border: `1px solid ${C.darkBorder}` }}
    >
      <div
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl"
        style={{ background: accentColor }}
      >
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: C.darkText }}>{desc}</p>
    </div>
  );
}

/** Numbered "how it works" card (01 / 02 / 03) */
function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div
      className="rounded-3xl p-8"
      style={{ background: '#FFFFFF', border: `1px solid ${C.border}` }}
    >
      <div className="mb-4 text-5xl font-black" style={{ color: C.brandLt, letterSpacing: '-0.03em' }}>
        {num}
      </div>
      <h3 className="mb-2 text-xl font-bold" style={{ color: '#111215', letterSpacing: '-0.01em' }}>{title}</h3>
      <p className="text-base leading-relaxed" style={{ color: C.muted }}>{desc}</p>
    </div>
  );
}

/** FAQ accordion item */
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b py-5"
      style={{ borderColor: C.border }}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
      >
        <span className="text-base font-semibold" style={{ color: '#111215' }}>{q}</span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition"
          style={{ background: C.brand }}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: C.muted }}>{a}</p>
      )}
    </div>
  );
}

/** Stat block */
function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-black" style={{ color: C.brand, letterSpacing: '-0.03em' }}>{value}</div>
      <div className="mt-1 text-sm font-medium" style={{ color: C.muted }}>{label}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SCHEME GRID  — mimics MIA's colourful SaaS logo mosaic
   ═══════════════════════════════════════════════════════════════════ */
const SCHEMES = [
  { emoji: '🎓', name: 'Scholarships', bg: 'linear-gradient(135deg,#3B82F6,#1D4ED8)' },
  { emoji: '🌾', name: 'PM-Kisan', bg: 'linear-gradient(135deg,#22C55E,#15803D)' },
  { emoji: '🏥', name: 'Ayushman', bg: 'linear-gradient(135deg,#EF4444,#B91C1C)' },
  { emoji: '🏠', name: 'Housing', bg: 'linear-gradient(135deg,#F97316,#C2410C)' },
  { emoji: '👩‍💼', name: 'Women', bg: 'linear-gradient(135deg,#EC4899,#9D174D)' },
  { emoji: '⚡', name: 'Solar', bg: 'linear-gradient(135deg,#EAB308,#A16207)' },
  { emoji: '💼', name: 'MNREGA', bg: 'linear-gradient(135deg,#8B5CF6,#5B21B6)' },
  { emoji: '🧒', name: 'Child Care', bg: 'linear-gradient(135deg,#06B6D4,#0E7490)' },
  { emoji: '🛡️', name: 'Insurance', bg: 'linear-gradient(135deg,#6366F1,#4338CA)' },
];

function SchemeGrid() {
  return (
    <div className="decor grid grid-cols-3 gap-3">
      {SCHEMES.map((s, i) => (
        <div
          key={s.name}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl shadow-xl"
          style={{
            background: s.bg,
            transform: `rotate(${i % 2 === 0 ? '2deg' : '-2deg'}) scale(${i === 4 ? 1.1 : 1})`,
          }}
        >
          <span className="text-3xl">{s.emoji}</span>
          <span className="text-center text-[10px] font-bold leading-tight text-white">{s.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function Landing() {
  const { t, session, start, language, languages, setLanguage } = useApp();
  const nav = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authed = Boolean(session?.authenticated && session.user?.consent.dataProcessing.granted);

  const L = t.landing;

  const go = async () => {
    setBusy(true); setError(null);
    try { if (!authed) await start(true); nav('/chat'); }
    catch { setError(t.bot.errorFallback); }
    finally { setBusy(false); }
  };

  const faqs = [
    { q: L.faq1Q, a: L.faq1A },
    { q: L.faq2Q, a: L.faq2A },
    { q: L.faq3Q, a: L.faq3A },
    { q: L.faq4Q, a: L.faq4A },
    { q: L.faq5Q, a: L.faq5A },
    { q: L.faq6Q, a: L.faq6A },
  ];

  /* ── render ───────────────────────────────────────────────────── */
  return (
    <div className="overflow-x-hidden" style={{ background: C.canvas, color: '#111215' }}>

      {/* ══ NAVBAR ════════════════════════════════════════════════ */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-md"
        style={{ background: 'rgba(244,244,254,0.92)', borderColor: C.border }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2 text-xl font-black tracking-tight" style={{ color: '#111215', letterSpacing: '-0.02em' }}>
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-black text-white"
              style={{ background: C.brand }}
            >
              DS
            </span>
            DigiScheme
          </a>

          {/* Nav links */}
          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            {[
              ['#features', L.navFeatures],
              ['#howitworks', L.navHowItWorks],
              ['#languages', L.navLanguages],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="text-sm font-medium transition-colors"
                style={{ color: C.muted }}
                onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = C.brand)}
                onMouseLeave={(e) => ((e.target as HTMLAnchorElement).style.color = C.muted)}
              >
                {label}
              </a>
            ))}
            <a
              href="#languages"
              className="rounded-full px-4 py-1.5 text-sm font-semibold transition"
              style={{ background: C.brandLt, color: C.brand }}
            >
              {languages.length} {L.navLanguages}
            </a>
          </nav>

          {/* Right Controls: Language Selector Dropdown + CTAs */}
          <div className="flex items-center gap-3">
            {/* Dynamic Navbar Language Dropdown */}
            <label className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition hover:border-brand/40"
              style={{ borderColor: C.border, background: '#FFFFFF', color: '#111215' }}>
              <LanguagesIcon className="h-4 w-4 shrink-0" style={{ color: C.brand }} aria-hidden />
              <select
                aria-label={L.navSelectLanguage}
                value={language}
                onChange={(e) => void setLanguage(e.target.value)}
                className="cursor-pointer bg-transparent text-sm font-semibold outline-none"
                style={{ color: '#111215' }}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code} lang={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
            </label>

            {session?.authenticated && (
              <button type="button" onClick={() => nav('/chat')} className="hidden text-sm font-bold sm:inline-block" style={{ color: C.brand }}>
                {L.navOpenApp}
              </button>
            )}
            <PillCTA onClick={() => void go()} disabled={busy} testId="start-nav">
              {authed ? L.navGoToChat : L.navStartFree}
            </PillCTA>
          </div>
        </div>
      </header>

      {/* ══ SECTION 1 — HERO ══════════════════════════════════════ */}
      <section className="relative overflow-hidden px-6 pb-32 pt-24 text-center" style={{ background: C.canvas }}>
        {/* Floating icons */}
        <FloatCard emoji="🎓" label="Scholarship" style={{ top: '8%',  left: '4%'  }} rotate={-10} />
        <FloatCard emoji="🌾" label="Kisan Nidhi" style={{ top: '30%', left: '8%'  }} rotate={6}  />
        <FloatCard emoji="🏥" label="Ayushman"    style={{ top: '58%', left: '3%'  }} rotate={-5} />
        <FloatCard emoji="🏠" label="PM Housing"  style={{ top: '6%',  right: '5%' }} rotate={8}  />
        <FloatCard emoji="👩‍💼" label="Mahila"     style={{ top: '32%', right: '4%' }} rotate={-9} />
        <FloatCard emoji="⚡" label="Solar Yojana" style={{ top: '58%', right: '7%' }} rotate={5}  />

        <div className="relative mx-auto max-w-3xl">
          {/* Top announcement badge */}
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold"
            style={{ background: '#FFFFFF', borderColor: C.border, color: C.brand }}
          >
            <Sparkles className="h-4 w-4" aria-hidden style={{ color: '#F59E0B' }} />
            {L.heroBadge}
          </div>

          {/* Hero headline */}
          <h1
            className="text-5xl font-bold leading-tight sm:text-6xl md:text-7xl"
            style={{ color: '#111215', letterSpacing: '-0.03em', lineHeight: 1.1 }}
          >
            {L.heroHeadline1}{' '}
            <span style={{ color: C.brand }}>{L.heroHeadline2}</span>
          </h1>

          <p
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed"
            style={{ color: C.muted }}
          >
            {L.heroSub}
          </p>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <TrustBadge stars label={L.heroBadge1} />
            <TrustBadge stars label={L.heroBadge2} />
            <TrustBadge label={L.heroBadge3} />
          </div>

          {/* CTA row */}
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <PillCTA onClick={() => void go()} disabled={busy} testId="start-hero">
              {authed ? L.heroCtaAuth : L.heroCta}
            </PillCTA>
            <PillCTA secondary onClick={() => document.getElementById('howitworks')?.scrollIntoView({ behavior: 'smooth' })}>
              {L.heroCtaSecondary}
            </PillCTA>
          </div>
        </div>
      </section>

      {/* ══ MARQUEE — trusted by ══════════════════════════════════ */}
      <section className="border-y px-6 py-10" style={{ background: C.canvas, borderColor: C.border }}>
        <p className="mb-5 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: C.muted }}>
          {L.marqueeTitle}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 opacity-60">
          {['Delhi', 'Punjab', 'Tamil Nadu', 'Maharashtra', 'Karnataka', 'West Bengal', 'Gujarat', 'Uttar Pradesh', 'Rajasthan'].map((state) => (
            <span key={state} className="text-base font-bold text-slate-500">{state}</span>
          ))}
        </div>
      </section>

      {/* ══ SECTION 2 — DARK PILLARS ══════════════════════════════
          Dark section with rounded top corners — MIA signature
       ══════════════════════════════════════════════════════════ */}
      <section
        id="features"
        className="px-6 py-20"
        style={{
          background: C.dark,
          borderRadius: '40px 40px 0 0',
          marginTop: '-1px',
        }}
      >
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-14 text-center">
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              {[L.pillarsTag1, L.pillarsTag2, L.pillarsTag3, L.pillarsTag4].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-4 py-1.5 text-sm font-semibold"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#A5B4FC' }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <h2
              className="mx-auto max-w-2xl text-4xl font-bold sm:text-5xl"
              style={{ color: '#A5B4FC', letterSpacing: '-0.03em', lineHeight: 1.15 }}
            >
              {L.pillarsHeadline}
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg" style={{ color: C.darkText }}>
              {L.pillarsSub1}{' '}
              <span className="rounded-full px-3 py-0.5 text-sm font-bold" style={{ background: 'rgba(249,115,22,0.2)', color: '#FB923C' }}>
                {L.pillarsSub2}
              </span>
              {' '}{L.pillarsSub3}
            </p>
          </div>

          {/* Two-column: text + scheme grid */}
          <div className="mb-16 grid items-center gap-16 lg:grid-cols-2">
            <div>
              <ul className="space-y-5">
                {[
                  ['🎯', L.pillarsBullet1],
                  ['🛡️', L.pillarsBullet2],
                  ['🗣️', L.pillarsBullet3],
                  ['📋', L.pillarsBullet4],
                ].map(([icon, text]) => (
                  <li key={text} className="flex items-start gap-4">
                    <span className="text-2xl">{icon}</span>
                    <span className="text-base font-medium text-white">{text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <PillCTA onClick={() => void go()} disabled={busy}>
                  {authed ? L.pillarsCtaAuth : L.pillarsCta}
                </PillCTA>
              </div>
            </div>
            <div className="mx-auto w-full max-w-xs sm:max-w-sm">
              <SchemeGrid />
            </div>
          </div>

          {/* Four pillar cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <PillarCard
              icon={SearchCheck}
              title={L.p1Title}
              desc={L.p1Desc}
              accentColor="#4338CA"
            />
            <PillarCard
              icon={ShieldCheck}
              title={L.p2Title}
              desc={L.p2Desc}
              accentColor="#0D9488"
            />
            <PillarCard
              icon={MessageCircle}
              title={L.p3Title}
              desc={L.p3Desc}
              accentColor="#F97316"
            />
            <PillarCard
              icon={FileText}
              title={L.p4Title}
              desc={L.p4Desc}
              accentColor="#8B5CF6"
            />
          </div>
        </div>
      </section>

      {/* ══ SECTION 3 — HOW IT WORKS (white, 01/02/03 cards) ═════ */}
      <section id="howitworks" className="bg-white px-6 py-24">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-14 grid gap-10 lg:grid-cols-2 lg:items-end">
            <div>
              <div className="mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5" style={{ color: C.brand }} aria-hidden />
                <TagPill label={L.howTag} />
              </div>
              <h2
                className="text-4xl font-bold sm:text-5xl"
                style={{ color: '#111215', letterSpacing: '-0.03em', lineHeight: 1.15 }}
              >
                {L.howHeadline}
              </h2>
            </div>
            <p className="text-lg leading-relaxed" style={{ color: C.muted }}>
              {L.howSub}
            </p>
          </div>

          {/* 01 / 02 / 03 cards */}
          <div className="grid gap-5 md:grid-cols-3">
            <StepCard
              num={L.s1Num}
              title={L.s1Title}
              desc={L.s1Desc}
            />
            <StepCard
              num={L.s2Num}
              title={L.s2Title}
              desc={L.s2Desc}
            />
            <StepCard
              num={L.s3Num}
              title={L.s3Title}
              desc={L.s3Desc}
            />
          </div>

          {/* Stats strip */}
          <div
            className="mt-14 grid grid-cols-2 gap-8 rounded-3xl p-10 md:grid-cols-4"
            style={{ background: C.canvas, border: `1px solid ${C.border}` }}
          >
            <StatBlock value={L.stat1Val} label={L.stat1Label} />
            <StatBlock value={L.stat2Val} label={L.stat2Label} />
            <StatBlock value={L.stat3Val} label={L.stat3Label} />
            <StatBlock value={L.stat4Val} label={L.stat4Label} />
          </div>
        </div>
      </section>

      {/* ══ SECTION 4 — LANGUAGE SELECTOR + CONSENT ══════════════ */}
      <section id="languages" className="px-6 py-24" style={{ background: C.canvas }}>
        <div className="mx-auto max-w-xl">
          <div className="mb-10 text-center">
            <TagPill label={L.langTag} />
            <h2
              className="mt-4 text-3xl font-bold"
              style={{ color: '#111215', letterSpacing: '-0.02em' }}
            >
              {L.langHeadline}
            </h2>
            <p className="mt-3 text-base" style={{ color: C.muted }}>
              {L.langSub}
            </p>
          </div>

          {/* Language grid */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t.ui.language}>
            {languages.map((l) => (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={l.code === language}
                lang={l.code}
                onClick={() => void setLanguage(l.code)}
                className="tap rounded-2xl border px-3 py-3 text-base font-semibold transition"
                style={l.code === language
                  ? { background: C.brand, color: '#fff', borderColor: C.brand, boxShadow: '0 4px 14px rgba(67,56,202,0.35)' }
                  : { background: '#fff', color: '#111215', borderColor: C.border }}
              >
                {l.native}
              </button>
            ))}
          </div>

          {/* Consent & CTA card */}
          <div
            className="mt-6 rounded-3xl p-7"
            style={{ background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 4px 24px rgba(0,0,0,0.05)' }}
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: '#10B981' }} aria-hidden />
              <div>
                <h3 className="font-bold" style={{ color: '#111215' }}>{t.ui.consentTitle}</h3>
                <p className="mt-1 text-sm" style={{ color: C.muted }}>{t.ui.consentText}</p>
              </div>
            </div>

            {!authed && (
              <label
                className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-sm transition"
                style={{ background: C.canvas }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-indigo-600"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  data-testid="agree"
                />
                <span style={{ color: C.muted }}>{t.ui.agree}</span>
              </label>
            )}

            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
            )}

            <button
              type="button"
              onClick={() => void go()}
              disabled={busy || (!authed && !agreed)}
              data-testid="start"
              className="group mt-5 inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-lg font-bold text-white transition disabled:opacity-50"
              style={{ background: '#FF6B35' }}
            >
              {authed ? t.ui.openChat : t.ui.start}
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 group-hover:bg-white/30">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ══ SECTION 5 — FAQ ACCORDION ════════════════════════════ */}
      <section className="bg-white px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-start">
            {/* Left: heading with scribble-style accent */}
            <div>
              <h2
                className="text-4xl font-bold sm:text-5xl"
                style={{ color: '#111215', letterSpacing: '-0.03em', lineHeight: 1.1 }}
              >
                {L.faqHeadline1}{' '}
                <span style={{ color: C.brand, borderBottom: `3px solid ${C.brand}` }}>
                  {L.faqHeadline2}
                </span>
              </h2>
              <p className="mt-6 text-base" style={{ color: C.muted }}>
                {L.faqSub}
              </p>
              <div className="mt-8">
                <PillCTA onClick={() => void go()} disabled={busy}>
                  {authed ? L.faqCtaAuth : L.faqCta}
                </PillCTA>
              </div>
            </div>

            {/* Right: accordion */}
            <div>
              {faqs.map((item) => (
                <FAQItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ SECTION 6 — PUZZLE-PIECE CTA BANNER ══════════════════ */}
      <section className="px-6 py-20" style={{ background: C.canvas }}>
        <div className="mx-auto max-w-4xl">
          <div
            className="relative overflow-hidden rounded-3xl px-10 py-14 text-center"
            style={{ background: C.brand }}
          >
            {/* Background watermark */}
            <div
              aria-hidden
              className="decor pointer-events-none absolute inset-0 flex items-center justify-center opacity-10 select-none"
              style={{ fontSize: '18rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.05em' }}
            >
              DS
            </div>

            <div className="relative">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold text-white">
                <UserRoundCheck className="h-4 w-4" aria-hidden /> {L.ctaBadge}
              </span>
              <h2
                className="mx-auto max-w-xl text-3xl font-bold text-white sm:text-4xl"
                style={{ letterSpacing: '-0.03em', lineHeight: 1.15 }}
              >
                {L.ctaHeadline1}{' '}
                <span className="rounded-xl bg-white/20 px-3">DigiScheme</span>
                {' '}{L.ctaHeadline2}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-indigo-200">
                {L.ctaSub}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <button
                  type="button"
                  onClick={() => void go()}
                  disabled={busy}
                  className="group inline-flex items-center gap-3 rounded-full bg-white px-7 py-3.5 text-base font-bold transition hover:bg-indigo-50 disabled:opacity-50"
                  style={{ color: C.brand }}
                >
                  {L.ctaBtn}
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-white transition group-hover:scale-105"
                    style={{ background: C.brand }}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ SECTION 7 — TRUST STRIP ══════════════════════════════ */}
      <section className="border-t bg-white px-6 py-12" style={{ borderColor: C.border }}>
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap justify-center gap-8 text-sm" style={{ color: C.muted }}>
            {[
              { icon: ShieldCheck, text: L.trust1 },
              { icon: SearchCheck, text: L.trust2 },
              { icon: UserRoundCheck, text: L.trust3 },
              { icon: Sparkles,    text: L.trust4 },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <Icon className="h-4 w-4" style={{ color: '#10B981' }} aria-hidden />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ FOOTER — dark rounded top ════════════════════════════ */}
      <footer
        style={{
          background: C.dark,
          borderRadius: '36px 36px 0 0',
          marginTop: '-1px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Watermark */}
        <div
          aria-hidden
          className="decor pointer-events-none absolute inset-0 flex items-end justify-center overflow-hidden select-none"
          style={{ fontSize: '20rem', fontWeight: 900, color: '#1C1E22', letterSpacing: '-0.05em', lineHeight: 1 }}
        >
          DS
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pb-10 pt-16">
          {/* Top link columns */}
          <div className="mb-14 grid gap-10 sm:grid-cols-2 md:grid-cols-4">
            {[
              { title: L.footerColHome, links: [L.footerLink1, L.footerLink2, L.footerLink3, L.footerLink4] },
              { title: L.footerColFeatures, links: [L.footerLink5, L.footerLink6, L.footerLink7, L.footerLink8] },
              { title: L.footerColCitizens, links: [L.footerLink9, L.footerLink10, L.footerLink11, L.footerLink12, L.footerLink13] },
              { title: L.footerColResources, links: [L.footerLink14, L.footerLink15, L.footerLink16, L.footerLink17] },
            ].map(({ title, links }) => (
              <div key={title}>
                <h3 className="mb-4 text-sm font-bold text-white">{title}</h3>
                <ul className="space-y-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-sm transition" style={{ color: C.darkText }} onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#fff')} onMouseLeave={(e) => ((e.target as HTMLElement).style.color = C.darkText)}>
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Large callout heading */}
          <div
            className="mb-10 border-t pt-10 text-3xl font-bold text-white sm:text-4xl"
            style={{ borderColor: C.darkBorder, letterSpacing: '-0.03em' }}
          >
            {L.footerCallout1}{' '}
            <span style={{ color: '#A5B4FC', borderBottom: `2px solid ${C.brand}` }}>{L.footerCallout2}</span>
          </div>

          {/* Bottom bar */}
          <div
            className="flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-xs"
            style={{ borderColor: C.darkBorder, color: C.darkText }}
          >
            <span>{L.footerCopyright}</span>
            <div className="flex gap-5">
              {[L.footerLegal, L.footerPrivacy, L.footerCookies].map((item) => (
                <a key={item} href="#" className="transition hover:text-white">{item}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
