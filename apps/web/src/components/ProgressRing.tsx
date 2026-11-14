export function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 34, c = 2 * Math.PI * r, off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`${label}: ${value}%`}>
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
        <circle cx="42" cy="42" r={r} fill="none" stroke="#E2E8F0" strokeWidth="9" />
        <circle cx="42" cy="42" r={r} fill="none" stroke="#FF6B35" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 42 42)" />
        <text x="42" y="48" textAnchor="middle" fontSize="18" fontWeight="700" fill="#1F2761">{value}%</text>
      </svg>
      <span className="text-base font-semibold text-brand">{label}</span>
    </div>
  );
}
