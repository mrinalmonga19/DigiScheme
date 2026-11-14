import type { FieldKey, FieldSource, Profile } from '@digischeme/shared';

/** Build a profile from plain values. Fields listed in `verified` get a verified source. */
export function profileOf(
  values: Partial<Record<FieldKey, unknown>>,
  verified: FieldKey[] | 'all' = [],
  verifiedSource: FieldSource = 'digilocker_verified',
): Profile {
  const out: Profile = {};
  for (const [k, v] of Object.entries(values) as Array<[FieldKey, unknown]>) {
    const isV = verified === 'all' || verified.includes(k);
    out[k] = { value: v, source: isV ? verifiedSource : 'self_declared', capturedAt: '2026-11-14T00:00:00.000Z', confidence: isV ? 1 : 0.8 };
  }
  return out;
}
