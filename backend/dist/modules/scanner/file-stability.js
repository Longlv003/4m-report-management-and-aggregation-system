"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeFileSha256 = computeFileSha256;
exports.isFileStable = isFileStable;
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
function computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto_1.default.createHash('sha256');
        const stream = fs_1.default.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
}
async function isFileStable(filePath, checkIntervalMs = 2000, maxChecks = 2) {
    if (!fs_1.default.existsSync(filePath))
        return false;
    let lastStat = fs_1.default.statSync(filePath);
    for (let i = 0; i < maxChecks; i++) {
        await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
        if (!fs_1.default.existsSync(filePath))
            return false;
        const currentStat = fs_1.default.statSync(filePath);
        if (currentStat.size !== lastStat.size || currentStat.mtimeMs !== lastStat.mtimeMs) {
            // File is still being written
            return false;
        }
        lastStat = currentStat;
    }
    return true;
}
