"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authMiddleware = authMiddleware;
exports.requirePermission = requirePermission;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const secrets_js_1 = require("../config/secrets.js");
const configuration_provider_js_1 = require("../config/configuration-provider.js");
const app_error_js_1 = require("../errors/app-error.js");
const connection_js_1 = require("../database/connection.js");
function signToken(user, expiresIn = configuration_provider_js_1.configurationProvider.getAppConfig().app.jwt.expiresIn) {
    return jsonwebtoken_1.default.sign({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roleId: user.roleId,
        roleName: user.roleName,
        permissions: user.permissions
    }, (0, secrets_js_1.getJwtSecret)(), { expiresIn: expiresIn });
}
async function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new app_error_js_1.AuthenticationError('Vui lòng đăng nhập để truy cập hệ thống');
        }
        const token = authHeader.split(' ')[1];
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, (0, secrets_js_1.getJwtSecret)());
        }
        catch {
            throw new app_error_js_1.AuthenticationError('Phiên đăng nhập đã hết hạn hoặc không hợp lệ');
        }
        // Check account status in DB
        const db = (0, connection_js_1.getDb)();
        const accountRes = await db.execute({
            sql: `SELECT a.id, a.username, a.full_name, a.role_id, a.custom_permissions, a.is_active, r.role_name, r.permissions as role_permissions
            FROM accounts a
            JOIN roles r ON a.role_id = r.id
            WHERE a.id = ? LIMIT 1;`,
            args: [payload.id]
        });
        if (accountRes.rows.length === 0) {
            throw new app_error_js_1.AuthenticationError('Tài khoản không tồn tại trên hệ thống');
        }
        const row = accountRes.rows[0];
        if (row.is_active !== 1) {
            throw new app_error_js_1.AuthenticationError('Tài khoản này hiện đang bị khóa');
        }
        const permissions = row.custom_permissions
            ? JSON.parse(row.custom_permissions)
            : JSON.parse(row.role_permissions || '[]');
        req.user = {
            id: row.id,
            username: row.username,
            fullName: row.full_name,
            roleId: row.role_id,
            roleName: row.role_name,
            permissions
        };
        next();
    }
    catch (err) {
        next(err);
    }
}
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) {
            return next(new app_error_js_1.AuthenticationError());
        }
        if (!req.user.permissions.includes(permission)) {
            return next(new app_error_js_1.AuthorizationError(`Bạn không có quyền: ${permission}`));
        }
        next();
    };
}
