import { pack, tr } from '@digischeme/shared';
import { env } from '../config/env';
import { logger } from '../config/logger';
import type { IMessagingChannel } from '../channels/types';
import type { AppContext } from '../context';
import { decryptValue } from './crypto';

/**
 * Application-tracker reminders (spec 3.2). WhatsApp users get a message; web users see the reminder
 * on their dashboard. Each reminder fires once, then it is cleared.
 */
export class ReminderService {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly app: AppContext, private readonly channel: IMessagingChannel) {}

  async tick(now = new Date()): Promise<number> {
    const due = await this.app.trackers.due(now.toISOString());
    let sent = 0;
    for (const t of due) {
      const user = await this.app.store.users.findOne({ _id: t.userId });
      if (!user) { await this.app.trackers.clearReminder(t._id); continue; }
      if (user.channel === 'whatsapp' && user.phoneEnc) {
        try {
          const phone = String(decryptValue(user.phoneEnc));
          const scheme = this.app.registry.get(t.schemeSlug);
          const name = scheme ? tr(scheme.name, user.preferredLanguage) : t.schemeSlug;
          const msg = pack(user.preferredLanguage).wa.reminder.replace('{scheme}', name);
          await this.channel.send(phone, { body: msg });
          sent++;
        } catch (err) {
          logger.warn({ err: (err as Error).message }, 'reminder send failed');
          continue; // keep it due; try again next tick
        }
      }
      await this.app.trackers.clearReminder(t._id);
    }
    return sent;
  }

  start(everyMs = 15 * 60_000): void {
    if (this.timer || env.isTest) return;
    this.timer = setInterval(() => { this.tick().catch((e) => logger.warn({ err: (e as Error).message }, 'reminder tick failed')); }, everyMs);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
