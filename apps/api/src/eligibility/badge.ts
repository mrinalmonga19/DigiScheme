import type { Badge, EligibilityStatus } from '@digischeme/shared';

/**
 * The single place where Verified vs Estimated is decided (spec 11.3).
 * The UI and the assistant only render what this returns.
 */
export function statusFor(state: 'pass' | 'fail' | 'missing', allFieldsVerified: boolean): EligibilityStatus {
  if (state === 'fail') return 'NOT_ELIGIBLE';
  if (state === 'missing') return 'LIKELY_NEEDS_INFO';
  return allFieldsVerified ? 'ELIGIBLE_VERIFIED' : 'ELIGIBLE_ESTIMATED';
}

export function badgeFor(status: EligibilityStatus): Badge {
  switch (status) {
    case 'ELIGIBLE_VERIFIED':
      return 'verified';
    case 'ELIGIBLE_ESTIMATED':
      return 'estimated';
    case 'LIKELY_NEEDS_INFO':
      return 'needs_info';
    case 'NOT_ELIGIBLE':
      return 'not_eligible';
  }
}
