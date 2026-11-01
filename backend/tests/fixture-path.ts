import path from 'node:path';
import { configurationProvider } from '../src/config/configuration-provider.js';
import { pathProvider } from '../src/config/path-provider.js';

// Tests use configured local fixtures, without depending on the network share or root copies.
export function fixturePath(source: 'wcsScan' | 'wcsCvr' | 'plusExcel' | 'plusError', filename: string): string {
  return path.resolve(pathProvider.getBaseDir(),configurationProvider.getSourceFiles().sources[source].directory,filename);
}
