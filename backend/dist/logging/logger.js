"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class Logger {
    logDir = null;
    currentLogFile = null;
    isFileLoggingReady = false;
    init(logDirectory) {
        try {
            this.logDir = logDirectory;
            if (!fs_1.default.existsSync(this.logDir)) {
                fs_1.default.mkdirSync(this.logDir, { recursive: true });
            }
            const today = new Date().toISOString().split('T')[0];
            this.currentLogFile = path_1.default.join(this.logDir, `scan4m-${today}.log`);
            this.isFileLoggingReady = true;
            this.info('Logger initialized successfully', { module: 'Logger', logFile: this.currentLogFile });
        }
        catch (err) {
            console.error('[LOGGER_INIT_FAIL] Could not initialize file logger:', err);
        }
    }
    formatMessage(level, message, context) {
        const timestamp = new Date().toISOString();
        const moduleName = context?.module ? `[${context.module}]` : '[App]';
        const ctxString = context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
        return `${timestamp} ${level.padEnd(5)} ${moduleName} ${message}${ctxString}`;
    }
    write(level, message, context) {
        const formatted = this.formatMessage(level, message, context);
        // Output to stdout/stderr
        if (level === 'ERROR' || level === 'FATAL') {
            console.error(formatted);
        }
        else if (level === 'WARN') {
            console.warn(formatted);
        }
        else {
            console.log(formatted);
        }
        // Write to daily file if initialized
        if (this.isFileLoggingReady && this.currentLogFile) {
            try {
                fs_1.default.appendFileSync(this.currentLogFile, formatted + '\n', 'utf8');
            }
            catch (err) {
                console.error('[LOGGER_FILE_WRITE_FAIL]', err);
            }
        }
    }
    debug(message, context) {
        this.write('DEBUG', message, context);
    }
    info(message, context) {
        this.write('INFO', message, context);
    }
    warn(message, context) {
        this.write('WARN', message, context);
    }
    error(message, context) {
        this.write('ERROR', message, context);
    }
    fatal(message, context) {
        this.write('FATAL', message, context);
    }
}
exports.logger = new Logger();
