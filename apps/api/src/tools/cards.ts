import { tr, type EligibilityResult, type Scheme, type SchemeCardView } from '@digischeme/shared';
import { badgeFor, explain } from '../eligibility';

export function buildCard(scheme: Scheme, result: EligibilityResult, lang: string): SchemeCardView {
  const ex = explain(result, lang);
  return {
    slug: scheme.slug,
    name: tr(scheme.name, lang),
    officialName: scheme.name.en,
    benefit: tr(scheme.benefitSummary, lang),
    category: scheme.category,
    level: scheme.level,
    status: result.status,
    badge: badgeFor(result.status),
    reasons: ex.reasons,
    failed: ex.failed,
    missing: ex.missing,
    notChecked: scheme.notChecked,
    rankScore: result.rankScore,
    dataQuality: scheme.dataQuality,
    hasGuide: scheme.applicationSteps.length > 0,
  };
}
