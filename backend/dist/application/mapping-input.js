"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mappingInput = mappingInput;
const item_mapping_js_1 = require("../domain/item-mapping.js");
const app_error_js_1 = require("../errors/app-error.js");
function mappingInput(body) {
    const { itemName, seqNo, pcsPerSheet, process = '', build = '', model = '' } = body;
    const count = Number(pcsPerSheet);
    if (typeof itemName !== 'string' || !itemName.trim() || typeof seqNo !== 'string' || !(0, item_mapping_js_1.normalizeSeqNo)(seqNo) ||
        typeof process !== 'string' || typeof build !== 'string' || typeof model !== 'string' ||
        (pcsPerSheet !== null && (!['string', 'number'].includes(typeof pcsPerSheet) || String(pcsPerSheet).trim() === '' ||
            !Number.isSafeInteger(count) || count < 0))) {
        throw new app_error_js_1.ValidationError('Item name, Seq no và số pcs/sheet nguyên không âm là bắt buộc');
    }
    return { itemName: itemName.trim(), seqNo: (0, item_mapping_js_1.normalizeSeqNo)(seqNo), pcsPerSheet: pcsPerSheet === null ? null : count,
        process: process.trim(), build: build.trim(), model: model.trim() };
}
