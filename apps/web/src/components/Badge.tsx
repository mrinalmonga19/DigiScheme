import { BadgeCheck, CircleHelp, CircleSlash, Gauge } from 'lucide-react';
import type { Badge as BadgeKind } from '@digischeme/shared';
import { useApp } from '../state/app';

const STYLE: Record<BadgeKind, string> = {
  verified: 'bg-verified-bg text-verified border-verified/40',
  estimated: 'bg-estimated-bg text-estimated border-estimated/40',
  needs_info: 'bg-slate-100 text-slate-700 border-slate-300',
  not_eligible: 'bg-slate-100 text-slate-600 border-slate-300',
};
const ICON = { verified: BadgeCheck, estimated: Gauge, needs_info: CircleHelp, not_eligible: CircleSlash };

/** Colour is never the only signal: every badge also carries an icon and a word (accessibility, spec 13). */
export function StatusBadge({ badge }: { badge: BadgeKind }) {
  const { t } = useApp();
  const label = { verified: t.bot.statusVerified, estimated: t.bot.statusEstimated, needs_info: t.bot.statusNeedsInfo, not_eligible: t.bot.statusNotEligible }[badge];
  const Icon = ICON[badge];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold ${STYLE[badge]}`} data-testid={`badge-${badge}`}>
      <Icon className="h-4 w-4" aria-hidden /> {label}
    </span>
  );
}

export function DemoBadge({ detail }: { detail?: string }) {
  const { t } = useApp();
  return (
    <span className="inline-flex items-center rounded-full border border-saffron bg-saffron-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-saffron-600" data-testid="demo-badge" title={detail}>
      {t.ui.demoMode}
    </span>
  );
}
