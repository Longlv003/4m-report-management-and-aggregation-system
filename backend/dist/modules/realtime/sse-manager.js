"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseManager = void 0;
const logger_js_1 = require("../../logging/logger.js");
class SseManager {
    clients = new Set();
    heartbeatInterval = null;
    constructor() {
        // Send heartbeat every 20s to keep connection alive
        this.heartbeatInterval = setInterval(() => {
            this.broadcast({ event: 'ping', data: { timestamp: new Date().toISOString() } });
        }, 20000);
        this.heartbeatInterval.unref();
    }
    addClient(res) {
        this.clients.add(res);
        logger_js_1.logger.info(`SSE client connected. Active clients: ${this.clients.size}`, { module: 'SSE' });
        res.on('close', () => {
            this.clients.delete(res);
            logger_js_1.logger.info(`SSE client disconnected. Active clients: ${this.clients.size}`, { module: 'SSE' });
        });
    }
    broadcast(event) {
        const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n${event.id ? `id: ${event.id}\n` : ''}\n`;
        for (const client of this.clients) {
            try {
                client.write(payload);
            }
            catch (err) {
                logger_js_1.logger.warn('Failed to write to SSE client, removing client', { module: 'SSE', err });
                this.clients.delete(client);
            }
        }
    }
    getActiveCount() {
        return this.clients.size;
    }
}
exports.sseManager = new SseManager();
