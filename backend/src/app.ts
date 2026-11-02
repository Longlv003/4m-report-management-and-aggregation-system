import express from 'express';
import cors from 'cors';
import { auditMiddleware } from './middlewares/audit.middleware.js';
import { clientIpMiddleware } from './middlewares/client-ip.middleware.js';
import path from 'path';
import fs from 'fs';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { errorHandlerMiddleware } from './middlewares/error-handler.middleware.js';
import { apiRouter } from './routes/api.routes.js';
import { pathProvider } from './config/path-provider.js';
import { configurationProvider } from './config/configuration-provider.js';

export function createApp(): express.Application {
  const app = express();
  // Only the local frontend proxy can supply a forwarded client address.
  app.set('trust proxy', 'loopback');

  app.use(requestIdMiddleware);
  app.use(clientIpMiddleware);
  app.use(auditMiddleware);

  app.use(cors({ origin: configurationProvider.getAppConfig().app.corsOrigins }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // API endpoints
  app.use('/api/v1', apiRouter);

  // Serve Frontend static assets if built
  const frontendDist = path.resolve(pathProvider.getBaseDir(), 'frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // Centralized Error Handler
  app.use(errorHandlerMiddleware);

  return app;
}
