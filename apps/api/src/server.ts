import { createApp } from './app';
import { whatsappChannel } from './routes/webhooks';
import { createContext } from './context';
import { env } from './config/env';
import { logger } from './config/logger';
import { ReminderService } from './services/reminders';

const ctx = await createContext();
const app = createApp(ctx);
const reminders = new ReminderService(ctx, whatsappChannel);
reminders.start();

const server = app.listen(env.PORT, () => {
  logger.warn(
    { port: env.PORT, db: ctx.store.mode, llm: env.LLM_MODE, digilocker: env.DIGILOCKER_MODE, whatsapp: env.WHATSAPP_MODE },
    `DigiScheme API listening on :${env.PORT}`,
  );
});

const shutdown = (): void => {
  reminders.stop();
  server.close(() => { void ctx.store.close().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
