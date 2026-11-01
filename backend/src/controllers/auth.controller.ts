import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { auditService } from '../composition/management.js';
import { auditedMutation } from '../composition/audited-mutation.js';
import { getDb } from '../database/connection.js';
import { signToken } from '../middlewares/auth.middleware.js';
import { AuthenticationError, ValidationError } from '../errors/app-error.js';

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      throw new ValidationError('Tên đăng nhập và mật khẩu không được để trống');
    }

    const db = getDb();
    const accountRes = await db.execute({
      sql: `SELECT a.id, a.username, a.password_hash, a.full_name, a.role_id, a.custom_permissions, a.is_active, r.role_name, r.permissions as role_permissions
            FROM accounts a
            JOIN roles r ON a.role_id = r.id
            WHERE a.username = ? LIMIT 1;`,
      args: [username.trim()]
    });

    if (accountRes.rows.length === 0) {
      throw new AuthenticationError('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    const user = accountRes.rows[0];
    if (user.is_active !== 1) {
      throw new AuthenticationError('Tài khoản này hiện đang bị khóa');
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash as string);
    if (!isMatch) {
      throw new AuthenticationError('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    const permissions = user.custom_permissions
      ? JSON.parse(user.custom_permissions as string)
      : JSON.parse((user.role_permissions as string) || '[]');

    const authUser = {
      id: user.id as string,
      username: user.username as string,
      fullName: user.full_name as string,
      roleId: user.role_id as string,
      roleName: user.role_name as string,
      permissions
    };

    const token = signToken(authUser);
    await auditService().record({ actor: { id: authUser.id,username: authUser.username,ip: req.ip }, action: 'LOGIN',resource: 'auth',outcome: 'SUCCESS' });
    req.auditRecorded = true;

    res.json({
      success: true,
      data: {
        token,
        user: authUser
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getMeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({
      success: true,
      data: req.user
    });
  } catch (err) {
    next(err);
  }
}

export async function changePasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Mật khẩu hiện tại và mật khẩu mới không được để trống');
    }
    if (newPassword.length < 6) {
      throw new ValidationError('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const db = getDb();
    const accountRes = await db.execute({
      sql: `SELECT password_hash FROM accounts WHERE id = ? LIMIT 1;`,
      args: [req.user!.id]
    });

    if (accountRes.rows.length === 0) {
      throw new AuthenticationError('Tài khoản không tồn tại');
    }

    const currentHash = accountRes.rows[0].password_hash as string;
    if (!bcrypt.compareSync(currentPassword, currentHash)) {
      throw new ValidationError('Mật khẩu hiện tại không chính xác');
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    const now = new Date().toISOString();

    await auditedMutation({ id: req.user!.id,username: req.user!.username,ip: req.ip },'password','CHANGE_PASSWORD',req.user!.id, async tx => {
    await tx.execute({
      sql: `UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?;`,
      args: [newHash, now, req.user!.id]
    });
    });
    req.auditRecorded = true;

    res.json({
      success: true,
      message: 'Đổi mật khẩu thành công'
    });
  } catch (err) {
    next(err);
  }
}

export async function logoutController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await auditService().record({ actor: { id: req.user!.id,username: req.user!.username,ip: req.ip },action: 'LOGOUT',resource: 'auth',outcome: 'SUCCESS' });
    req.auditRecorded = true;
    res.json({ success: true, data: null });
  } catch (error) { next(error); }
}
