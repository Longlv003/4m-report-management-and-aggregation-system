import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathProvider } from './path-provider.js';
import { ConfigurationError } from '../errors/app-error.js';

export function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) throw new ConfigurationError('JWT_SECRET must contain at least 32 characters');
    return process.env.JWT_SECRET;
  }
  const file = path.join(pathProvider.getPaths().runtimeDir, 'jwt-secret');
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const secret = fs.readFileSync(file, 'utf8').trim();
  if (secret.length < 32) throw new ConfigurationError('Stored JWT secret is invalid');
  return secret;
}

// Only used when creating accounts for a new installation; existing passwords are preserved.
export function getInitialPassword(username: 'admin' | 'user'): string {
  const configured = process.env[`INITIAL_${username.toUpperCase()}_PASSWORD`];
  if (configured) {
    if (configured.length < 12) throw new ConfigurationError('Initial passwords must contain at least 12 characters');
    return configured;
  }
  const file = path.join(pathProvider.getPaths().runtimeDir, 'initial-credentials.json');
  const credentials: Record<string, string> = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!credentials[username]) {
    credentials[username] = crypto.randomBytes(18).toString('base64url');
    fs.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  }
  return credentials[username];
}
