import { isIP } from 'node:net';
import { Request, Response, NextFunction } from 'express';

declare global { namespace Express { interface Request { clientIp?: string; } } }

export function normalizeClientIp(address: string | undefined): string | undefined {
  if (!address || !isIP(address)) return undefined;
  if (address === '::1') return '127.0.0.1';
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}

/** Capture before the socket closes; req.ip may be unavailable in response finish handlers. */
export function clientIpMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.clientIp = normalizeClientIp(req.ip) || normalizeClientIp(req.socket.remoteAddress);
  next();
}
