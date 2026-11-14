import type { Store } from '../db/store';
import { newId } from './crypto';

export interface AuditEvent {
  userId: string | null;
  eventType: string;
  toolName?: string | null;
  schemeSlug?: string | null;
  ruleVersion?: string | null;
  /** Short machine-readable outcome ("ELIGIBLE_ESTIMATED", "ok"). Never raw message text. */
  result: string;
}

/** Append-only audit log (spec 6). Callers pass codes, not user text, so there is no PII to leak. */
export class AuditService {
  constructor(private readonly store: Store) {}

  async log(e: AuditEvent): Promise<void> {
    try {
      await this.store.audit.insert({
        _id: newId(),
        userId: e.userId,
        eventType: e.eventType,
        toolName: e.toolName ?? null,
        schemeSlug: e.schemeSlug ?? null,
        ruleVersion: e.ruleVersion ?? null,
        result: e.result.slice(0, 120),
        timestamp: new Date().toISOString(),
      });
    } catch {
      /* auditing must never break a user request */
    }
  }

  async recent(limit = 200) {
    const rows = await this.store.audit.find({}, { sort: { field: 'timestamp', dir: -1 }, limit });
    return rows;
  }
}
