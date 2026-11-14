import {
  ArrowRight, CheckCircle2, FileText, MessageCircle, SearchCheck,
  ShieldCheck, Sparkles, Star, UserRoundCheck, Zap,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/app';

/* ─── Floating isometric icon card (hero decoration) ─── */
function FloatCard({ emoji, label, style }: { emoji: string; label: string; style: React.CSSProperties }) {
  return (
    <div
      aria-hidden
      className="decor pointer-events-none absolute flex flex-col items-center gap-1 select-none"
      style={style}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-lg backdrop-blur-sm text-3xl"
        style={{ transform: 'rotate(-8deg)' }}>
        {emoji}
      </div>
      <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-brand backdrop-blur-sm">{label}</span>
    </div>
  );
}

/* ─── Pill badge (feature tags like "Identities", "Governance") ─── */
function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-indigo-200 bg-white/10 px-4 py-1.5 text-sm font-semibold text-indigo-100 backdrop-blur-sm">
      {label}
    </span>
  );
}

/* ─── Review badge (Capterra / Play Store style) ─── */
function ReviewBadge({ store, rating }: { store: string; rating: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
      <div className="flex gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <span className="font-bold text-slate-900">{rating}</span>
      <span className="text-sm text-slate-500">{store}</span>
    </div>
  );
}

/* ─── Feature card for "four pillars" section ─── */
function PillarCard({ icon: Icon, title, desc, accent }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm transition hover:bg-white/10">
      <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl ${accent}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <h3 className="mb-2 text-lg font-bold text-white">{title}</h3>
      <p className="text-sm leading-relaxed text-indigo-200">{desc}</p>
    </div>
  );
}

/* ─── Scheme app grid (mimics the MIA SaaS logo grid) ─── */
function SchemeGrid() {
  const schemes = [
    { emoji: '🎓', name: 'Scholarships', color: 'from-blue-500 to-blue-700' },
    { emoji: '🌾', name: 'Kisan Yojana', color: 'from-green-500 to-green-700' },
    { emoji: '🏥', name: 'Health Cover', color: 'from-red-500 to-red-700' },
    { emoji: '🏠', name: 'Housing', color: 'from-orange-500 to-orange-700' },
    { emoji: '👩‍💼', name: 'Women Empow.', color: 'from-pink-500 to-pink-700' },
    { emoji: '⚡', name: 'Solar Energy', color: 'from-yellow-500 to-yellow-700' },
    { emoji: '💼', name: 'Employment', color: 'from-indigo-500 to-indigo-700' },
    { emoji: '🧒', name: 'Child Welfare', color: 'from-teal-500 to-teal-700' },
    { emoji: '🛡️', name: 'Insurance', color: 'from-purple-500 to-purple-700' },
  ];
  return (
    <div className="decor relative mx-auto grid max-w-xs grid-cols-3 gap-3 sm:max-w-sm">
      {schemes.map((s) => (
        <div
          key={s.name}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br ${s.color} p-3 shadow-xl aspect-square`}
          style={{ transform: `rotate(${Math.random() > 0.5 ? '2deg' : '-2deg'})` }}
        >
          <span className="text-2xl">{s.emoji}</span>
          <span className="text-center text-[10px] font-bold text-white leading-tight">{s.name}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Step card for "How it works" ─── */
function StepCard({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-saffron font-black text-white text-lg">
        {step}
      </div>
      <div>
        <h3 className="font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-600">{desc}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN LANDING PAGE
═══════════════════════════════════════════════════════════ */
export default function Landing() {
  const { t, session, start, language, languages, setLanguage } = useApp();
  const nav = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authed = Boolean(session?.authenticated && session.user?.consent.dataProcessing.granted);

  const go = async () => {
    setBusy(true); setError(null);
    try { if (!authed) await start(true); nav('/chat'); }
    catch { setError(t.bot.errorFallback); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ fontFamily: 'inherit' }}>

      {/* ── NAVBAR ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="/" className="flex items-center gap-2 text-xl font-black tracking-tight text-brand">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white text-sm font-black">DS</span>
            DigiScheme
          </a>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Site navigation">
            <a href="#features" className="text-sm font-medium text-slate-600 hover:text-brand transition-colors">Features</a>
            <a href="#how" className="text-sm font-medium text-slate-600 hover:text-brand transition-colors">How it works</a>
            <a href="#languages" className="text-sm font-medium text-slate-600 hover:text-brand transition-colors">Languages</a>
          </nav>
          <div className="flex items-center gap-3">
            {session?.authenticated && (
              <button
                type="button"
                onClick={() => nav('/chat')}
                className="text-sm font-semibold text-brand hover:underline"
              >
                Open App
              </button>
            )}
            <button
              type="button"
              onClick={() => void go()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
            >
              {authed ? 'Go to Chat' : 'Get Started'} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          SECTION 1 — HERO (lavender bg, centered)
      ══════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden px-4 pb-24 pt-20 text-center"
        style={{ background: 'linear-gradient(160deg, #eef0fa 0%, #e8eaf8 40%, #f0eeff 100%)' }}
      >
        {/* Floating decorative icons */}
        <FloatCard emoji="🎓" label="Scholarship" style={{ top: '10%', left: '5%' }} />
        <FloatCard emoji="🌾" label="Kisan" style={{ top: '20%', left: '12%' }} />
        <FloatCard emoji="🏥" label="Health" style={{ top: '55%', left: '4%' }} />
        <FloatCard emoji="🏠" label="Housing" style={{ top: '8%', right: '6%' }} />
        <FloatCard emoji="👩‍💼" label="Women" style={{ top: '30%', right: '4%' }} />
        <FloatCard emoji="⚡" label="Solar" style={{ top: '60%', right: '8%' }} />

        <div className="relative mx-auto max-w-3xl">
          {/* Top badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-white/80 px-4 py-1.5 text-sm font-semibold text-brand shadow-sm backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-saffron" aria-hidden />
            Powered by AI · Available in 9 languages
          </div>

          <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Government schemes,{' '}
            <span style={{ color: '#1F2761' }}>found and verified.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-lg text-slate-600">
            DigiScheme finds every central and state scheme you're eligible for.
            Verify with DigiLocker, ask in your language, apply in minutes.
          </p>

          {/* Review badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ReviewBadge store="Play Store" rating="4.9" />
            <ReviewBadge store="Trusted by 50K+" rating="★★★★★" />
            <ReviewBadge store="DigiLocker" rating="Official" />
          </div>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => void go()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-8 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-brand-600 disabled:opacity-50"
            >
              {authed ? 'Open DigiScheme' : 'Check Your Eligibility'} <ArrowRight className="h-5 w-5" />
            </button>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-8 py-4 text-lg font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SECTION 2 — DARK "Four pillars" (navy bg)
      ══════════════════════════════════════════ */}
      <section
        id="features"
        className="px-4 py-20"
        style={{ background: 'linear-gradient(160deg, #0f0e1a 0%, #1a1830 60%, #12112a 100%)' }}
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            {/* Left: text */}
            <div>
              <div className="mb-6 flex flex-wrap gap-2">
                <Pill label="Schemes" />
                <Pill label="Verification" />
                <Pill label="DigiLocker" />
                <Pill label="Multilingual" />
              </div>
              <h2 className="text-3xl font-black leading-tight text-white sm:text-4xl md:text-5xl"
                style={{ color: '#a29bfe' }}>
                One platform, every scheme you deserve.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-indigo-200">
                Your profile,{' '}
                <span className="inline-flex items-center rounded-full bg-saffron/20 px-3 py-0.5 text-sm font-bold text-saffron">verified</span>
                {' '}documents, and eligibility — in one sovereign platform, driven by the data you choose to share.
              </p>
            </div>

            {/* Right: scheme grid */}
            <div className="flex justify-center">
              <SchemeGrid />
            </div>
          </div>

          {/* Pillar cards */}
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" id="pillars">
            <PillarCard
              icon={SearchCheck}
              title="Eligibility Engine"
              desc="Rules for 300+ central and state schemes. Know instantly what you qualify for."
              accent="bg-indigo-500"
            />
            <PillarCard
              icon={ShieldCheck}
              title="DigiLocker Verified"
              desc="Connect once, get verified results with a 'Verified' badge across all schemes."
              accent="bg-green-600"
            />
            <PillarCard
              icon={MessageCircle}
              title="9 Languages"
              desc="Ask questions in Hindi, Tamil, Bengali, Gujarati and 5 more. AI understands you."
              accent="bg-saffron"
            />
            <PillarCard
              icon={FileText}
              title="Apply with Guide"
              desc="Step-by-step application walkthroughs with document checklists and PDF kits."
              accent="bg-purple-600"
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SECTION 3 — HOW IT WORKS (white bg)
      ══════════════════════════════════════════ */}
      <section id="how" className="bg-white px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand/10 px-4 py-1.5 text-sm font-bold text-brand">
              <Zap className="h-4 w-4" aria-hidden /> Simple 3-step process
            </div>
            <h2 className="text-3xl font-black text-slate-900 sm:text-4xl">Get your schemes in minutes</h2>
            <p className="mt-4 text-slate-600">No paperwork maze. No office visits. Just answers.</p>
          </div>

          <div className="grid gap-10 md:grid-cols-3">
            <StepCard
              step="1"
              title="Tell us about yourself"
              desc="Answer a few quick questions in your language — state, income, education, category. The AI guides you."
            />
            <StepCard
              step="2"
              title="Verify with DigiLocker"
              desc="Optionally connect DigiLocker to auto-fill your profile. Your documents, your choice."
            />
            <StepCard
              step="3"
              title="See your schemes"
              desc="Get a personalised list of schemes with Verified or Estimated badges, benefit details, and apply guides."
            />
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-2 gap-6 rounded-3xl border border-slate-100 bg-slate-50 p-8 md:grid-cols-4">
            {[
              { stat: '300+', label: 'Schemes covered' },
              { stat: '9', label: 'Indian languages' },
              { stat: '100%', label: 'Free to use' },
              { stat: '0', label: 'Data sold' },
            ].map(({ stat, label }) => (
              <div key={label} className="text-center">
                <div className="text-3xl font-black text-brand">{stat}</div>
                <div className="mt-1 text-sm text-slate-600">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SECTION 4 — LANGUAGE SELECTOR + CONSENT
      ══════════════════════════════════════════ */}
      <section
        id="languages"
        className="px-4 py-20"
        style={{ background: 'linear-gradient(160deg, #eef0fa 0%, #e8eaf8 100%)' }}
      >
        <div className="mx-auto max-w-xl">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black text-slate-900">Choose your language</h2>
            <p className="mt-2 text-slate-600">DigiScheme speaks your mother tongue.</p>
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
                className={`tap rounded-2xl border px-3 py-3 text-base font-semibold transition ${
                  l.code === language
                    ? 'border-brand bg-brand text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-900 hover:border-brand/40 hover:bg-brand/5'
                }`}
              >
                {l.native}
              </button>
            ))}
          </div>

          {/* Consent & CTA card */}
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
              <div>
                <h3 className="font-bold text-slate-900">{t.ui.consentTitle}</h3>
                <p className="mt-1 text-sm text-slate-600">{t.ui.consentText}</p>
              </div>
            </div>

            {!authed && (
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm transition hover:bg-slate-100">
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 accent-brand"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  data-testid="agree"
                />
                <span className="text-slate-700">{t.ui.agree}</span>
              </label>
            )}

            {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

            <button
              type="button"
              onClick={() => void go()}
              disabled={busy || (!authed && !agreed)}
              data-testid="start"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-saffron px-6 py-4 text-lg font-bold text-white shadow-md transition hover:bg-saffron-600 disabled:opacity-50"
            >
              {authed ? t.ui.openChat : t.ui.start} <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          SECTION 5 — TRUST / PRIVACY FOOTER STRIP
      ══════════════════════════════════════════ */}
      <section className="border-t border-slate-200 bg-white px-4 py-10">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-500">
            {[
              { icon: ShieldCheck, text: 'No Aadhaar stored' },
              { icon: CheckCircle2, text: 'DigiLocker official integration' },
              { icon: UserRoundCheck, text: 'You own your data' },
              { icon: Sparkles, text: 'AI-powered, human-reviewed rules' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-green-600" aria-hidden />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="px-4 py-10 text-center text-sm text-indigo-200"
        style={{ background: '#0f0e1a' }}
      >
        <p className="font-semibold text-white">DigiScheme</p>
        <p className="mt-1">Made in India · AI-powered government scheme discovery</p>
        <p className="mt-3 text-indigo-400 text-xs">
          DigiScheme is an independent eligibility assistant. Official application portals are linked directly from each scheme.
        </p>
      </footer>
    </div>
  );
}
