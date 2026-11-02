"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeClientIp = normalizeClientIp;
exports.clientIpMiddleware = clientIpMiddleware;
const node_net_1 = require("node:net");
function normalizeClientIp(address) {
    if (!address || !(0, node_net_1.isIP)(address))
        return undefined;
    if (address === '::1')
        return '127.0.0.1';
    return address.startsWith('::ffff:') && (0, node_net_1.isIP)(address.slice(7)) === 4 ? address.slice(7) : address;
}
/** Capture before the socket closes; req.ip may be unavailable in response finish handlers. */
function clientIpMiddleware(req, _res, next) {
    req.clientIp = normalizeClientIp(req.ip) || normalizeClientIp(req.socket.remoteAddress);
    next();
}
