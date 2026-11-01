"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathProvider = exports.PathProvider = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const app_error_js_1 = require("../errors/app-error.js");
class PathProvider {
    static instance = null;
    configFilePath;
    paths;
    baseDir;
    constructor(baseDir) {
        // baseDir is anchored to the project root (parent of backend, or where app resides)
        this.baseDir = baseDir || path_1.default.resolve(__dirname, '../../..');
        this.configFilePath = path_1.default.resolve(__dirname, '../../config/paths.json');
        this.loadAndResolve();
    }
    static getInstance(baseDir) {
        if (!PathProvider.instance) {
            PathProvider.instance = new PathProvider(baseDir);
        }
        return PathProvider.instance;
    }
    loadAndResolve() {
        if (!fs_1.default.existsSync(this.configFilePath)) {
            throw new app_error_js_1.ConfigurationError(`Configuration file paths.json does not exist at: ${this.configFilePath}`);
        }
        try {
            const raw = fs_1.default.readFileSync(this.configFilePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.paths) {
                throw new app_error_js_1.ConfigurationError('Invalid paths.json format: Missing "paths" root object');
            }
            const p = parsed.paths;
            const resolvePath = (relPath) => {
                // Resolve relative to baseDir
                const resolved = path_1.default.isAbsolute(relPath) ? relPath : path_1.default.resolve(this.baseDir, relPath);
                return path_1.default.normalize(resolved);
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
        }
        catch (err) {
            if (err instanceof app_error_js_1.ConfigurationError)
                throw err;
            throw new app_error_js_1.ConfigurationError(`Failed to parse paths.json: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    ensureDirectories() {
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
                if (!fs_1.default.existsSync(d)) {
                    fs_1.default.mkdirSync(d, { recursive: true });
                }
                // Test write access
                fs_1.default.accessSync(d, fs_1.default.constants.R_OK | fs_1.default.constants.W_OK);
            }
            catch (err) {
                throw new app_error_js_1.ConfigurationError(`Runtime directory not accessible or writable: ${d}. Error: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
    getPaths() {
        return { ...this.paths };
    }
    getDatabaseFile() {
        return this.paths.databaseFile;
    }
    getDatabaseDir() {
        return this.paths.databaseDir;
    }
    getLogDir() {
        return this.paths.logDir;
    }
    getBackupDir() {
        return this.paths.backupDir;
    }
    getTempDir() {
        return this.paths.tempDir;
    }
    getConfigBackupDir() {
        return this.paths.configBackupDir;
    }
    getBaseDir() {
        return this.baseDir;
    }
    /**
     * Resolves an input directory:
     * 1. Checks if network share path is accessible
     * 2. Checks local data_input/ directory
     * 3. Fallbacks to provided fallbackDir or project root
     */
    async resolveInputDirectory(subDir, fallbackDir) {
        // 1. Try network UNC share
        if (this.paths.networkInputBaseDir) {
            try {
                const netPath = path_1.default.join(this.paths.networkInputBaseDir, subDir);
                await fs_1.default.promises.access(netPath);
                return netPath;
            }
            catch {
                // Network unreachable, fall through
            }
        }
        // 2. Try local data_input/ folder
        if (this.paths.localInputBaseDir) {
            const localPath = path_1.default.join(this.paths.localInputBaseDir, subDir);
            if (fs_1.default.existsSync(localPath)) {
                return localPath;
            }
        }
        // 3. Fallback to fallbackDir or root
        if (fallbackDir) {
            const fbPath = path_1.default.isAbsolute(fallbackDir) ? fallbackDir : path_1.default.resolve(this.baseDir, fallbackDir);
            if (fs_1.default.existsSync(fbPath)) {
                return fbPath;
            }
        }
        return this.baseDir;
    }
}
exports.PathProvider = PathProvider;
exports.pathProvider = PathProvider.getInstance();
