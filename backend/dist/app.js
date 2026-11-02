"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const audit_middleware_js_1 = require("./middlewares/audit.middleware.js");
const client_ip_middleware_js_1 = require("./middlewares/client-ip.middleware.js");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const request_id_middleware_js_1 = require("./middlewares/request-id.middleware.js");
const error_handler_middleware_js_1 = require("./middlewares/error-handler.middleware.js");
const api_routes_js_1 = require("./routes/api.routes.js");
const path_provider_js_1 = require("./config/path-provider.js");
const configuration_provider_js_1 = require("./config/configuration-provider.js");
function createApp() {
    const app = (0, express_1.default)();
    // Only the local frontend proxy can supply a forwarded client address.
    app.set('trust proxy', 'loopback');
    app.use(request_id_middleware_js_1.requestIdMiddleware);
    app.use(client_ip_middleware_js_1.clientIpMiddleware);
    app.use(audit_middleware_js_1.auditMiddleware);
    app.use((0, cors_1.default)({ origin: configuration_provider_js_1.configurationProvider.getAppConfig().app.corsOrigins }));
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // API endpoints
    app.use('/api/v1', api_routes_js_1.apiRouter);
    // Serve Frontend static assets if built
    const frontendDist = path_1.default.resolve(path_provider_js_1.pathProvider.getBaseDir(), 'frontend/dist');
    if (fs_1.default.existsSync(frontendDist)) {
        app.use(express_1.default.static(frontendDist));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api/'))
                return next();
            res.sendFile(path_1.default.join(frontendDist, 'index.html'));
        });
    }
    // Centralized Error Handler
    app.use(error_handler_middleware_js_1.errorHandlerMiddleware);
    return app;
}
