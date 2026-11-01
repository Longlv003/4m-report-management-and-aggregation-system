import fs from 'fs';
import path from 'path';
import { ConfigurationError } from '../errors/app-error.js';

export interface RuntimePaths {
  appRoot: string;
  databaseDir: string;
  databaseFile: string;
  logDir: string;
  backupDir: string;
  tempDir: string;
  configBackupDir: string;
  runtimeDir: string;
  networkInputBaseDir?: string;
  localInputBaseDir?: string;
}


export class PathProvider {
  private static instance: PathProvider | null = null;
  private readonly configFilePath: string;
  private paths!: RuntimePaths;
  private readonly baseDir: string;

  private constructor(baseDir?: string) {
    // baseDir is anchored to the project root (parent of backend, or where app resides)
    this.baseDir = baseDir || path.resolve(__dirname, '../../..');
    this.configFilePath = path.resolve(__dirname, '../../config/paths.json');
    this.loadAndResolve();
  }

  public static getInstance(baseDir?: string): PathProvider {
    if (!PathProvider.instance) {
      PathProvider.instance = new PathProvider(baseDir);
    }
    return PathProvider.instance;
  }

  public loadAndResolve(): void {
    if (!fs.existsSync(this.configFilePath)) {
      throw new ConfigurationError(`Configuration file paths.json does not exist at: ${this.configFilePath}`);
    }

    try {
      const raw = fs.readFileSync(this.configFilePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.paths) {
        throw new ConfigurationError('Invalid paths.json format: Missing "paths" root object');
      }

      const p = parsed.paths;
      const resolvePath = (relPath: string) => {
        // Resolve relative to baseDir
        const resolved = path.isAbsolute(relPath) ? relPath : path.resolve(this.baseDir, relPath);
        return path.normalize(resolved);
      };

      this.paths = {
        appRoot: resolvePath(p.appRoot || './'),
        databaseDir: resolvePath(p.databaseDir || './data/database'),
        databaseFile: resolvePath(p.databaseFile || './data/database/4m-aom-report.sqlite'),
        logDir: resolvePath(p.logDir || './data/logs'),
        backupDir: resolvePath(p.backupDir || './data/backups'),
        tempDir: resolvePath(p.tempDir || './data/temp'),
        configBackupDir: resolvePath(p.configBackupDir || './data/config-backups'),
        runtimeDir: resolvePath(p.runtimeDir || './runtime'),
        networkInputBaseDir: p.networkInputBaseDir || undefined,
        localInputBaseDir: p.localInputBaseDir ? resolvePath(p.localInputBaseDir) : undefined
      };

      this.ensureDirectories();
    } catch (err: unknown) {
      if (err instanceof ConfigurationError) throw err;
      throw new ConfigurationError(`Failed to parse paths.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private ensureDirectories(): void {
    const dirsToEnsure = [
      this.paths.databaseDir,
      this.paths.logDir,
      this.paths.backupDir,
      this.paths.tempDir,
      this.paths.configBackupDir,
      this.paths.runtimeDir
    ];

    for (const d of dirsToEnsure) {
      try {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
        // Test write access
        fs.accessSync(d, fs.constants.R_OK | fs.constants.W_OK);
      } catch (err) {
        throw new ConfigurationError(`Runtime directory not accessible or writable: ${d}. Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  public getPaths(): RuntimePaths {
    return { ...this.paths };
  }

  public getDatabaseFile(): string {
    return this.paths.databaseFile;
  }

  public getDatabaseDir(): string {
    return this.paths.databaseDir;
  }

  public getLogDir(): string {
    return this.paths.logDir;
  }

  public getBackupDir(): string {
    return this.paths.backupDir;
  }

  public getTempDir(): string {
    return this.paths.tempDir;
  }

  public getConfigBackupDir(): string {
    return this.paths.configBackupDir;
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Resolves an input directory:
   * 1. Checks if network share path is accessible
   * 2. Checks local data_input/ directory
   * 3. Fallbacks to provided fallbackDir or project root
   */
  public async resolveInputDirectory(subDir: string, fallbackDir?: string): Promise<string> {
    // 1. Try network UNC share
    if (this.paths.networkInputBaseDir) {
      try {
        const netPath = path.join(this.paths.networkInputBaseDir, subDir);
        await fs.promises.access(netPath);
        return netPath;
      } catch {
        // Network unreachable, fall through
      }
    }

    // 2. Try local data_input/ folder
    if (this.paths.localInputBaseDir) {
      const localPath = path.join(this.paths.localInputBaseDir, subDir);
      if (fs.existsSync(localPath)) {
        return localPath;
      }
    }

    // 3. Fallback to fallbackDir or root
    if (fallbackDir) {
      const fbPath = path.isAbsolute(fallbackDir) ? fallbackDir : path.resolve(this.baseDir, fallbackDir);
      if (fs.existsSync(fbPath)) {
        return fbPath;
      }
    }

    return this.baseDir;
  }
}

export const pathProvider = PathProvider.getInstance();
