const { execFileSync } = require('node:child_process');
const { networkInterfaces } = require('node:os');
const path = require('node:path');

// Prefer a physical adapter with a default gateway over VPN/virtual adapters.
const command = `
  $ErrorActionPreference = 'Stop'
  $adapters = @(Get-NetIPConfiguration | Where-Object {
    $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -and $_.IPv4Address
  })
  $physical = @($adapters | Where-Object { $_.NetAdapter.HardwareInterface })
  if ($physical.Count -gt 0) { $adapters = $physical }
  $selected = $adapters | Sort-Object { $_.NetIPv4Interface.InterfaceMetric } | Select-Object -First 1
  if ($selected) { $selected.IPv4Address[0].IPAddress }
`;
let address;
try {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const output = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(output)) address = output;
} catch {
  // Fall back when Windows network configuration queries are unavailable.
}
if (!address) {
  const interfaces = Object.entries(networkInterfaces());
  const physical = interfaces.filter(([name]) => !/zerotier|vpn|vethernet|virtual|tailscale|loopback|bluetooth/i.test(name));
  for (const [, entries] of [...physical, ...interfaces]) {
    const candidate = entries?.find(entry => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'));
    if (candidate) { address = candidate.address; break; }
  }
}
process.stdout.write((address || '127.0.0.1') + '\n');
