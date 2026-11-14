import type { TrackerStatus } from '@digischeme/shared';
import type { Store, TrackerDoc } from '../db/store';
import { newId } from './crypto';

export interface TrackerPatch {
  status?: TrackerStatus;
  checklistState?: Record<string, boolean>;
  notes?: string;
  reminderAt?: string | null;
}

/** Self-reported application tracker with reminders (spec 3.2). We never learn the real portal status. */
export class TrackerService {
  constructor(private readonly store: Store) {}

  list(userId: string): Promise<TrackerDoc[]> {
    return this.store.trackers.find({ userId }, { sort: { field: 'updatedAt', dir: -1 } });
  }

  async upsert(userId: string, schemeSlug: string, patch: TrackerPatch): Promise<TrackerDoc> {
    const existing = await this.store.trackers.findOne({ userId, schemeSlug });
    if (existing) return (await this.store.trackers.updateOne({ _id: existing._id }, patch))!;
    return this.store.trackers.insert({
      _id: newId(), userId, schemeSlug, status: 'planned', checklistState: {}, notes: '', reminderAt: null, ...patch,
    });
  }

  async update(userId: string, id: string, patch: TrackerPatch): Promise<TrackerDoc | null> {
    const t = await this.store.trackers.findOne({ _id: id });
    if (!t || t.userId !== userId) return null;
    return this.store.trackers.updateOne({ _id: id }, patch);
  }

  /** Trackers whose reminder time has passed and whose application is still open. */
  async due(nowIso = new Date().toISOString()): Promise<TrackerDoc[]> {
    const all = await this.store.trackers.find({});
    return all.filter((t) => t.reminderAt && t.reminderAt <= nowIso && ['planned', 'documents_ready'].includes(t.status));
  }

  async clearReminder(id: string): Promise<void> {
    await this.store.trackers.updateOne({ _id: id }, { reminderAt: null });
  }
}
