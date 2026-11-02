"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSeqNo = normalizeSeqNo;
/** Sequence numbers are identifiers: keep leading zeroes, remove pasted whitespace. */
function normalizeSeqNo(value) { return value.replace(/\s+/g, ''); }
