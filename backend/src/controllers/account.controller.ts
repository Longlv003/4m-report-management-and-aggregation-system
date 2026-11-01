import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { auditedMutation } from '../composition/audited-mutation.js';
import crypto from 'crypto';
import { getDb } from '../database/connection.js';
import { ValidationError, ConflictError, NotFoundError } from '../errors/app-error.js';

export async function getAccountsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const accounts = await db.execute(`
      SELECT a.id, a.username, a.full_name, a.role_id, a.custom_permissions, a.is_active, a.created_at,
             r.role_name, r.permissions as role_permissions
      FROM accounts a
      JOIN roles r ON a.role_id = r.id
      ORDER BY a.created_at DESC;
    `);

    const result = accounts.rows.map(row => {
      let perms: string[] = [];
      try {
        if (row.custom_permissions) {
          perms = JSON.parse(row.custom_permissions as string);
        } else if (row.role_permissions) {
          perms = JSON.parse(row.role_permissions as string);
        }
      } catch {
        perms = [];
      }
      return {
        id: row.id,
        username: row.username,
        full_name: row.full_name,
        role_id: row.role_id,
        role_name: row.role_name,
        permissions: perms,
        is_active: row.is_active,
        created_at: row.created_at
      };
    });

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
}

export async function createAccountController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = await auditedMutation({ id: req.user!.id, username: req.user!.username, ip: req.ip },
      'accounts','CREATE',undefined, async db => {
      const { username, password, fullName, roleName, permissions } = req.body;
      if (!username || !password || !fullName) {
        throw new ValidationError('Tất cả các trường thông tin tài khoản đều bắt buộc');
      }

      const existing = await db.execute({
        sql: `SELECT id FROM accounts WHERE username = ? LIMIT 1;`,
        args: [username.trim()]
      });

      if (existing.rows.length > 0) {
        throw new ConflictError(`Tên đăng nhập "${username}" đã tồn tại trên hệ thống`);
      }

      // Determine role and permissions
      const permsList: string[] = Array.isArray(permissions) ? permissions : [];
      const isAdmin = permsList.includes('accounts:manage') || (roleName && roleName.toUpperCase() === 'ADMIN');
      const roleId = isAdmin ? 'role-admin' : 'role-user';

      const hash = bcrypt.hashSync(password, 10);
      const newId = `acc-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const customPermsJson = JSON.stringify(Array.isArray(permissions) ? permsList : (isAdmin ? [
        'scan4m:view', 'scan4m:export', 'scan4m:manage', 'cvr4m:manage', 'cvr4m:view', 'cvr4m:export', 'accounts:manage', 'config:manage', 'audit:view', 'mapping:view', 'mapping:manage'
      ] : ['scan4m:view', 'cvr4m:view', 'mapping:view']));

      await db.execute({
        sql: `INSERT INTO accounts (id, username, password_hash, full_name, role_id, custom_permissions, is_active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        args: [newId, username.trim(), hash, fullName.trim(), roleId, customPermsJson, 1, now, now]
      });

      return {
        success: true,
        message: 'Tạo tài khoản thành công',
        data: { id: newId, username, fullName, roleName: isAdmin ? 'ADMIN' : 'USER' }
      };
    });
    req.auditRecorded = true;
    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
}

export async function toggleAccountActiveController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = await auditedMutation({ id: req.user!.id, username: req.user!.username, ip: req.ip },
      'accounts','TOGGLE_ACTIVE',req.params.id, async db => {
      const { id } = req.params;

      const accRes = await db.execute({
        sql: `SELECT id, username, is_active FROM accounts WHERE id = ? LIMIT 1;`,
        args: [id]
      });

      if (accRes.rows.length === 0) {
        throw new NotFoundError('Không tìm thấy tài khoản');
      }

      const acc = accRes.rows[0];
      if (acc.username === 'admin') {
        throw new ValidationError('Không thể khóa tài khoản quản trị viên gốc (admin)');
      }

      const newActive = acc.is_active === 1 ? 0 : 1;
      await db.execute({
        sql: `UPDATE accounts SET is_active = ?, updated_at = ? WHERE id = ?;`,
        args: [newActive, new Date().toISOString(), id]
      });

      return {
        success: true,
        message: newActive === 1 ? 'Mở khóa tài khoản thành công' : 'Đã khóa tài khoản thành công',
        data: { id, isActive: newActive }
      };
    });
    req.auditRecorded = true;
    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = await auditedMutation({ id: req.user!.id, username: req.user!.username, ip: req.ip },
      'accounts','RESET_PASSWORD',req.params.id, async db => {
      const { id } = req.params;
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        throw new ValidationError('Mật khẩu mới phải có ít nhất 6 ký tự');
      }

      const existing = await db.execute({ sql: 'SELECT id FROM accounts WHERE id=?', args: [id] });
      if (!existing.rows.length) throw new NotFoundError('Không tìm thấy tài khoản');
      const hash = bcrypt.hashSync(newPassword, 10);
      await db.execute({
        sql: `UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?;`,
        args: [hash, new Date().toISOString(), id]
      });

      return {
        success: true,
        message: 'Đặt lại mật khẩu thành công'
      };
    });
    req.auditRecorded = true;
    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}

export async function updateAccountController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = await auditedMutation({ id: req.user!.id, username: req.user!.username, ip: req.ip },
      'accounts','UPDATE',req.params.id, async db => {
      const { id } = req.params;
      const { fullName, permissions } = req.body;
      if (!fullName) {
        throw new ValidationError('Họ và tên không được để trống');
      }
      if (!Array.isArray(permissions)) {
        throw new ValidationError('Permissions phải là mảng');
      }

      const accRes = await db.execute({
        sql: `SELECT id, username, role_id FROM accounts WHERE id = ? LIMIT 1;`,
        args: [id]
      });
      if (accRes.rows.length === 0) {
        throw new NotFoundError('Không tìm thấy tài khoản');
      }

      const acc = accRes.rows[0];
      if (acc.username === 'admin' && !permissions.includes('accounts:manage')) {
        throw new ValidationError('Không thể bỏ quyền accounts:manage của tài khoản admin gốc');
      }

      const isAdmin = permissions.includes('accounts:manage');
      const roleId = isAdmin ? 'role-admin' : 'role-user';

      await db.execute({
        sql: `UPDATE accounts SET full_name = ?, role_id = ?, custom_permissions = ?, updated_at = ? WHERE id = ?;`,
        args: [fullName.trim(), roleId, JSON.stringify(permissions), new Date().toISOString(), id]
      });

      return { success: true, message: 'Cập nhật tài khoản thành công' };
    });
    req.auditRecorded = true;
    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
}
