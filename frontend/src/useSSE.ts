import { useEffect, useRef } from 'react';

// Share one connection across mounted tabs; callbacks can change without reconnecting.
const listeners = new Set<(type: string) => void>();
let eventSource: EventSource | null = null;

export function useSSE(onDataImported?: () => void, onErrorDetected?: () => void): void {
  const callbacks = useRef({ onDataImported, onErrorDetected });
  callbacks.current = { onDataImported, onErrorDetected };
  useEffect(() => {
    const listener = (type: string) => {
      if (type === 'error_detected') callbacks.current.onErrorDetected?.();
      else callbacks.current.onDataImported?.();
    };
    listeners.add(listener);
    if (!eventSource) {
      eventSource = new EventSource('/api/v1/realtime/stream');
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
      }
    };
  }, []);
}
