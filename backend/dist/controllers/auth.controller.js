"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginController = loginController;
exports.getMeController = getMeController;
exports.changePasswordController = changePasswordController;
exports.logoutController = logoutController;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const management_js_1 = require("../composition/management.js");
const audited_mutation_js_1 = require("../composition/audited-mutation.js");
const connection_js_1 = require("../database/connection.js");
const auth_middleware_js_1 = require("../middlewares/auth.middleware.js");
const app_error_js_1 = require("../errors/app-error.js");
async function loginController(req, res, next) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            throw new app_error_js_1.ValidationError('Tên đăng nhập và mật khẩu không được để trống');
        }
        const db = (0, connection_js_1.getDb)();
        const accountRes = await db.execute({
            sql: `SELECT a.id, a.username, a.password_hash, a.full_name, a.role_id, a.custom_permissions, a.is_active, r.role_name, r.permissions as role_permissions
            FROM accounts a
            JOIN roles r ON a.role_id = r.id
            WHERE a.username = ? LIMIT 1;`,
            args: [username.trim()]
        });
        if (accountRes.rows.length === 0) {
            throw new app_error_js_1.AuthenticationError('Tên đăng nhập hoặc mật khẩu không chính xác');
        }
        const user = accountRes.rows[0];
        if (user.is_active !== 1) {
            throw new app_error_js_1.AuthenticationError('Tài khoản này hiện đang bị khóa');
        }
        const isMatch = bcryptjs_1.default.compareSync(password, user.password_hash);
        if (!isMatch) {
            throw new app_error_js_1.AuthenticationError('Tên đăng nhập hoặc mật khẩu không chính xác');
        }
        const permissions = user.custom_permissions
            ? JSON.parse(user.custom_permissions)
            : JSON.parse(user.role_permissions || '[]');
        const authUser = {
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            roleId: user.role_id,
            roleName: user.role_name,
            permissions
        };
        const token = (0, auth_middleware_js_1.signToken)(authUser);
        await (0, management_js_1.auditService)().record({ actor: { id: authUser.id, username: authUser.username, ip: req.ip }, action: 'LOGIN', resource: 'auth', outcome: 'SUCCESS' });
        req.auditRecorded = true;
        res.json({
            success: true,
            data: {
                token,
                user: authUser
            }
        });
    }
    catch (err) {
        next(err);
    }
}
async function getMeController(req, res, next) {
    try {
        res.json({
            success: true,
            data: req.user
        });
    }
    catch (err) {
        next(err);
    }
}
async function changePasswordController(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            throw new app_error_js_1.ValidationError('Mật khẩu hiện tại và mật khẩu mới không được để trống');
        }
        if (newPassword.length < 6) {
            throw new app_error_js_1.ValidationError('Mật khẩu mới phải có ít nhất 6 ký tự');
        }
        const db = (0, connection_js_1.getDb)();
        const accountRes = await db.execute({
            sql: `SELECT password_hash FROM accounts WHERE id = ? LIMIT 1;`,
            args: [req.user.id]
        });
        if (accountRes.rows.length === 0) {
            throw new app_error_js_1.AuthenticationError('Tài khoản không tồn tại');
        }
        const currentHash = accountRes.rows[0].password_hash;
        if (!bcryptjs_1.default.compareSync(currentPassword, currentHash)) {
            throw new app_error_js_1.ValidationError('Mật khẩu hiện tại không chính xác');
        }
        const newHash = bcryptjs_1.default.hashSync(newPassword, 10);
        const now = new Date().toISOString();
        await (0, audited_mutation_js_1.auditedMutation)({ id: req.user.id, username: req.user.username, ip: req.ip }, 'password', 'CHANGE_PASSWORD', req.user.id, async (tx) => {
            await tx.execute({
                sql: `UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?;`,
                args: [newHash, now, req.user.id]
            });
        });
        req.auditRecorded = true;
        res.json({
            success: true,
            message: 'Đổi mật khẩu thành công'
        });
    }
    catch (err) {
        next(err);
    }
}
async function logoutController(req, res, next) {
    try {
        await (0, management_js_1.auditService)().record({ actor: { id: req.user.id, username: req.user.username, ip: req.ip }, action: 'LOGOUT', resource: 'auth', outcome: 'SUCCESS' });
        req.auditRecorded = true;
        res.json({ success: true, data: null });
    }
    catch (error) {
        next(error);
    }
}
