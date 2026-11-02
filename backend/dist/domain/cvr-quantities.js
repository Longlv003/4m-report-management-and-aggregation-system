"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateTotalPcs = calculateTotalPcs;
function calculateTotalPcs(sheets, pcsPerSheet) {
    if (sheets === null || pcsPerSheet === null || !Number.isFinite(sheets) ||
        !Number.isFinite(pcsPerSheet) || sheets < 0 || pcsPerSheet <= 0)
        return null;
    return sheets * pcsPerSheet;
}
