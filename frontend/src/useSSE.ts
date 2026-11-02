import { useEffect, useRef } from 'react';

// Share one connection across mounted tabs; callbacks can change without reconnecting.
const listeners = new Set<(type: string, data?: unknown) => void>();
let eventSource: EventSource | null = null;
let scannerStatus: boolean | undefined;

export function useSSE(onDataImported?: () => void, onErrorDetected?: () => void, onScannerStatus?: (scanning: boolean) => void): void {
  const callbacks = useRef({ onDataImported, onErrorDetected, onScannerStatus });
  callbacks.current = { onDataImported, onErrorDetected, onScannerStatus };
  useEffect(() => {
    const listener = (type: string, data?: unknown) => {
      if (type === 'scanner_status') {
        if (typeof data === 'boolean') callbacks.current.onScannerStatus?.(data);
      } else if (type === 'error_detected') callbacks.current.onErrorDetected?.();
      else callbacks.current.onDataImported?.();
    };
    listeners.add(listener);
    if (scannerStatus !== undefined) callbacks.current.onScannerStatus?.(scannerStatus);
    if (!eventSource) {
      eventSource = new EventSource('/api/v1/realtime/stream');
      eventSource.addEventListener('scanner_status', event => {
        try {
          const data: unknown = JSON.parse((event as MessageEvent).data);
          if (data && typeof data === 'object' && 'scanning' in data && typeof data.scanning === 'boolean') {
            scannerStatus = data.scanning;
            listeners.forEach(notify => notify('scanner_status', scannerStatus));
          }
        } catch (error) { console.error('Không thể đọc trạng thái quét', error); }
      });
      eventSource.onerror = () => {
        scannerStatus = undefined;
        listeners.forEach(notify => notify('scanner_status', true));
      };
      for (const type of ['data_imported', 'record_updated', 'error_detected']) {
        eventSource.addEventListener(type, () => {
          listeners.forEach(notify => notify(type));
        });
      }
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        eventSource?.close();
        eventSource = null;
        scannerStatus = undefined;
      }
    };
  }, []);
}
