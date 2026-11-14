import { ChevronRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SchemeCardView } from '@digischeme/shared';
import { useApp } from '../state/app';
import { StatusBadge } from './Badge';

export function SchemeCard({ card, onApply }: { card: SchemeCardView; onApply?: (slug: string) => void }) {
  const { t } = useApp();
  const canApply = card.hasGuide && (card.badge === 'verified' || card.badge === 'estimated');
  return (
    <article className="card" data-testid={`scheme-${card.slug}`} aria-labelledby={`h-${card.slug}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 id={`h-${card.slug}`} className="text-lg font-bold text-brand">{card.name}</h3>
        <StatusBadge badge={card.badge} />
      </div>
      {card.name !== card.officialName && <p className="text-sm text-slate-500" lang="en">{card.officialName}</p>}
      <p className="mt-2 text-base">{card.benefit}</p>
      {card.reasons.length > 0 && (
        <details className="mt-2">
          <summary className="tap cursor-pointer py-2 font-semibold text-brand">{t.ui.whyQualify}</summary>
          <ul className="ml-5 list-disc space-y-1 text-base">{card.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {card.badge === 'estimated' && <p className="mt-2 flex gap-2 text-sm text-slate-600"><Info className="h-4 w-4 shrink-0" aria-hidden />{t.bot.whyVerified}</p>}
        </details>
      )}
      {card.missing.length > 0 && <p className="mt-2 text-sm text-slate-600">{t.bot.needInfoFor.replace('{scheme}', card.name)} ({card.missing.map((m) => m.label).join(', ')})</p>}
      {card.notChecked.length > 0 && <p className="mt-2 text-sm text-slate-600"><strong>{t.bot.alsoRequired}</strong> {card.notChecked[0]}</p>}
      {card.dataQuality === 'needs_review' && <p className="mt-2 text-sm font-medium text-estimated">{t.ui.underReview}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/schemes/${card.slug}`} className="btn-ghost">{t.ui.officialSite} <ChevronRight className="h-4 w-4" aria-hidden /></Link>
        {canApply && onApply && <button type="button" className="btn-accent" onClick={() => onApply(card.slug)}>{t.bot.btnApply}</button>}
      </div>
    </article>
  );
}
