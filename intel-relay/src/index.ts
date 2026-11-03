import path from 'node:path';
import { serverConfig as config } from './config/env.js';
import { Logger } from './logging/logger.js';
import { AccountStore } from './accounts/store.js';
import { AccountManager } from './accounts/manager.js';
import { DashboardServer } from './dashboard/server.js';
const logger = new Logger(config.LOG_LEVEL);
logger.protect(config.DASHBOARD_PASSWORD);
logger.info('Message relay identity: original sender nickname/avatar (author-v2); relay label stays in the source footer.');
const manager = new AccountManager(new AccountStore(config.dataDir), logger);
const server = new DashboardServer(manager, config.DASHBOARD_PASSWORD, config.COOKIE_SECURE === 'true', path.resolve('src/dashboard/index.html'), config.PUBLIC_ORIGIN);
let stopping = false;
async function shutdown(code: number) {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => process.exit(code || 1), 90_000); deadline.unref();
  const results = await Promise.allSettled([server.stop(), manager.close()]);
  for (const result of results) if (result.status === 'rejected') logger.error('Relay shutdown cleanup failed.', result.reason);
  process.exit(code);
}
process.once('SIGINT', () => { void shutdown(0); });
process.once('SIGTERM', () => { void shutdown(0); });
process.on('uncaughtException', (error) => { logger.error('Fatal uncaught exception; shutting down.', error); void shutdown(1); });
process.on('unhandledRejection', (error) => { logger.error('Unhandled rejection; shutting down.', error); void shutdown(1); });
try {
  await server.start(config.DASHBOARD_HOST, config.DASHBOARD_PORT);
  logger.info('Relay dashboard listening.', { host: config.DASHBOARD_HOST, port: config.DASHBOARD_PORT });
  await manager.initialize();
} catch (error) { logger.error('Startup failed. Check configuration, data directory and port.', error); await shutdown(1); }
