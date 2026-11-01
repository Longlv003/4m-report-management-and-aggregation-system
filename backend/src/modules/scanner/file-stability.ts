import fs from 'fs';
import crypto from 'crypto';

export function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

export async function isFileStable(
  filePath: string,
  checkIntervalMs = 2000,
  maxChecks = 2
): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false;

  let lastStat = fs.statSync(filePath);
  for (let i = 0; i < maxChecks; i++) {
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    if (!fs.existsSync(filePath)) return false;
    const currentStat = fs.statSync(filePath);
    if (currentStat.size !== lastStat.size || currentStat.mtimeMs !== lastStat.mtimeMs) {
      // File is still being written
      return false;
    }
    lastStat = currentStat;
  }
  return true;
}
