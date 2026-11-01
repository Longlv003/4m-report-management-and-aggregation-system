import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { configurationProvider } from '../src/config/configuration-provider.js';
import { pathProvider } from '../src/config/path-provider.js';

// Legacy integration scripts must never migrate or import into the installed database.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), '4m-integration-'));
process.env.APP_DATABASE_URL = 'file:' + path.join(directory, 'test.sqlite').replace(/\\/g, '/');
process.env.INITIAL_ADMIN_PASSWORD = 'IntegrationAdmin123!';
process.env.INITIAL_USER_PASSWORD = 'IntegrationUser123!';
process.env.JWT_SECRET = 'integration-test-secret-at-least-32-characters';
configurationProvider.getScannerConfig().scanner.stabilityCheckMs = 0;
pathProvider.resolveInputDirectory = async (_subDir, fallback) => path.resolve(pathProvider.getBaseDir(), fallback || '.');
