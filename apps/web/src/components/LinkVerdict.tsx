import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import type { LinkCheckResult } from '@digischeme/shared';
import { useApp } from '../state/app';

const STYLE = {
  OFFICIAL: { cls: 'border-verified bg-verified-bg text-verified', Icon: ShieldCheck },
  NOT_OFFICIAL: { cls: 'border-estimated bg-estimated-bg text-estimated', Icon: ShieldQuestion },
  SUSPICIOUS: { cls: 'border-red-700 bg-red-50 text-red-800', Icon: ShieldAlert },
} as const;

export function LinkVerdict({ result }: { result: LinkCheckResult }) {
  const { t } = useApp();
  const { cls, Icon } = STYLE[result.verdict];
  const head = { OFFICIAL: t.bot.linkOfficial, NOT_OFFICIAL: t.bot.linkNotOfficial, SUSPICIOUS: t.bot.linkSuspicious }[result.verdict];
  return (
    <div className={`w-full rounded-2xl border-2 p-4 ${cls}`} role="alert" data-testid={`link-${result.verdict}`}>
      <p className="flex items-start gap-2 text-lg font-bold"><Icon className="mt-1 h-6 w-6 shrink-0" aria-hidden /> {head}</p>
      {result.verdict !== 'OFFICIAL' && (
        <>
          <ul className="ml-8 mt-2 list-disc space-y-1 text-base text-slate-800">{result.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>
          {result.suggestedOfficialLink && (
            <p className="mt-3 text-base text-slate-900">
              {t.bot.linkSuggest.replace('{scheme}', result.suggestedOfficialLink.label).replace('{url}', '')}{' '}
              <a className="font-bold underline" href={result.suggestedOfficialLink.url} target="_blank" rel="noreferrer noopener">{result.suggestedOfficialLink.url}</a>
            </p>
          )}
          <p className="mt-2 font-semibold text-slate-900">{t.bot.neverPay}</p>
        </>
      )}
    </div>
  );
}
