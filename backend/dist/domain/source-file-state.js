"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sameFingerprint = sameFingerprint;
exports.canSkipUnchangedFile = canSkipUnchangedFile;
function sameFingerprint(a, b) {
    return a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function canSkipUnchangedFile(state, current, parserVersion) {
    return Boolean(state && state.status === 'SUCCESS' && state.sourceStatus === 'SUCCESS' &&
        state.parserVersion >= parserVersion && state.sourceParserVersion >= parserVersion && sameFingerprint(state, current));
}
