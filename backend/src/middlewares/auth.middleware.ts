import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/secrets.js';
import { configurationProvider } from '../config/configuration-provider.js';
import { AuthenticationError, AuthorizationError } from '../errors/app-error.js';
import { getDb } from '../database/connection.js';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}


export function signToken(user: AuthUser, expiresIn = configurationProvider.getAppConfig().app.jwt.expiresIn): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: user.roleName,
      permissions: user.permissions
    },
    getJwtSecret(),
    { expiresIn: expiresIn as any }
  );
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Vui lòng đăng nhập để truy cập hệ thống');
    }

    const token = authHeader.split(' ')[1];
    let payload: any;
    try {
      payload = jwt.verify(token, getJwtSecret());
    } catch {
      throw new AuthenticationError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ');
    }

    // Check account status in DB
    const db = getDb();
    const accountRes = await db.execute({
      sql: `SELECT a.id, a.username, a.full_name, a.role_id, a.custom_permissions, a.is_active, r.role_name, r.permissions as role_permissions
            FROM accounts a
            JOIN roles r ON a.role_id = r.id
            WHERE a.id = ? LIMIT 1;`,
      args: [payload.id]
    });

    if (accountRes.rows.length === 0) {
      throw new AuthenticationError('Tài khoản không tồn tại trên hệ thống');
    }

    const row = accountRes.rows[0];
    if (row.is_active !== 1) {
      throw new AuthenticationError('Tài khoản này hiện đang bị khóa');
    }

    const permissions = row.custom_permissions
      ? JSON.parse(row.custom_permissions as string)
      : JSON.parse((row.role_permissions as string) || '[]');

    req.user = {
      id: row.id as string,
      username: row.username as string,
      fullName: row.full_name as string,
      roleId: row.role_id as string,
      roleName: row.role_name as string,
      permissions
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError());
    }
    if (!req.user.permissions.includes(permission)) {
      return next(new AuthorizationError(`Bạn không có quyền: ${permission}`));
    }
    next();
  };
}
