import { Response } from 'express';
import { logger } from '../../logging/logger.js';

export interface SseEvent {
  event: 'ping' | 'data_imported' | 'record_updated' | 'error_detected';
  data: unknown;
  id?: string;
}

class SseManager {
  private clients = new Set<Response>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Send heartbeat every 20s to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      this.broadcast({ event: 'ping', data: { timestamp: new Date().toISOString() } });
    }, 20000);
    this.heartbeatInterval.unref();
  }

  public addClient(res: Response): void {
    this.clients.add(res);
    logger.info(`SSE client connected. Active clients: ${this.clients.size}`, { module: 'SSE' });

    res.on('close', () => {
      this.clients.delete(res);
      logger.info(`SSE client disconnected. Active clients: ${this.clients.size}`, { module: 'SSE' });
    });
  }

  public broadcast(event: SseEvent): void {
    const payload = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n${event.id ? `id: ${event.id}\n` : ''}\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        logger.warn('Failed to write to SSE client, removing client', { module: 'SSE', err });
        this.clients.delete(client);
      }
    }
  }

  public getActiveCount(): number {
    return this.clients.size;
  }
}

export const sseManager = new SseManager();
