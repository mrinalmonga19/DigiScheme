import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { WEB_DIST } from './config/paths';
import type { AppContext } from './context';
import { attachUser } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errors';
import { apiLimiter } from './middleware/limits';
import { adminRoutes } from './routes/admin';
import { chatRoutes, mediaRoutes } from './routes/chat';
import { coreRoutes } from './routes/core';
import { dataRoutes } from './routes/data';
import { flowRoutes } from './routes/flows';
import { webhookRoutes } from './routes/webhooks';

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger, autoLogging: { ignore: (r) => r.url === '/api/health' }, serializers: { req: (r) => ({ id: r.id, method: r.method, url: r.url?.split('?')[0] }) } }));
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: { 'img-src': ["'self'", 'data:'], 'media-src': ["'self'", 'blob:'], 'connect-src': ["'self'"], 'font-src': ["'self'", 'data:'] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(cookieParser());

  // The WhatsApp webhook needs the raw urlencoded body for signature validation, so it mounts before the JSON parser.
  app.use('/api/webhooks', webhookRoutes(ctx));

  app.use(express.json({ limit: '256kb' }));
  app.use('/api', apiLimiter, attachUser(ctx));
  app.use('/api', coreRoutes(ctx));
  app.use('/api', mediaRoutes(ctx));
  app.use('/api', chatRoutes(ctx));
  app.use('/api', dataRoutes(ctx));
  app.use('/api', flowRoutes(ctx));
  app.use('/api/admin', adminRoutes(ctx));
  app.use('/api', notFound);

  // Optionally serve the built PWA from the same origin (one process for the demo).
  if (env.SERVE_WEB === 'true' && fs.existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
