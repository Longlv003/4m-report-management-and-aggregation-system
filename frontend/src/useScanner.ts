import { useRef, useState } from 'react';
import { triggerScan } from './api.js';
import { useSSE } from './useSSE.js';

/** Server state covers background scans, reconnects and scans from other tabs. */
export function useScanner() {
  const [serverScanning, setServerScanning] = useState(true);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  useSSE(undefined, undefined, setServerScanning);

  async function scan() {
    if (serverScanning || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try { await triggerScan(); }
    finally { inFlight.current = false; setPending(false); }
  }
  return { scanning: serverScanning || pending, scan };
}
