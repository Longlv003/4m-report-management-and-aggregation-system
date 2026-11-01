"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtSecret = getJwtSecret;
exports.getInitialPassword = getInitialPassword;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const path_provider_js_1 = require("./path-provider.js");
const app_error_js_1 = require("../errors/app-error.js");
function getJwtSecret() {
    if (process.env.JWT_SECRET) {
        if (process.env.JWT_SECRET.length < 32)
            throw new app_error_js_1.ConfigurationError('JWT_SECRET must contain at least 32 characters');
        return process.env.JWT_SECRET;
    }
    const file = node_path_1.default.join(path_provider_js_1.pathProvider.getPaths().runtimeDir, 'jwt-secret');
    if (!node_fs_1.default.existsSync(file)) {
        try {
            node_fs_1.default.writeFileSync(file, node_crypto_1.default.randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
        }
        catch (error) {
            if (error.code !== 'EEXIST')
                throw error;
        }
    }
    const secret = node_fs_1.default.readFileSync(file, 'utf8').trim();
    if (secret.length < 32)
        throw new app_error_js_1.ConfigurationError('Stored JWT secret is invalid');
    return secret;
}
// Only used when creating accounts for a new installation; existing passwords are preserved.
function getInitialPassword(username) {
    const configured = process.env[`INITIAL_${username.toUpperCase()}_PASSWORD`];
    if (configured) {
        if (configured.length < 12)
            throw new app_error_js_1.ConfigurationError('Initial passwords must contain at least 12 characters');
        return configured;
    }
    const file = node_path_1.default.join(path_provider_js_1.pathProvider.getPaths().runtimeDir, 'initial-credentials.json');
    const credentials = node_fs_1.default.existsSync(file) ? JSON.parse(node_fs_1.default.readFileSync(file, 'utf8')) : {};
    if (!credentials[username]) {
        credentials[username] = node_crypto_1.default.randomBytes(18).toString('base64url');
        node_fs_1.default.writeFileSync(file, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    }
    return credentials[username];
}
