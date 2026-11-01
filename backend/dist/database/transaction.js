"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withWriteTransaction = withWriteTransaction;
const connection_js_1 = require("./connection.js");
// SQLite has one writer. Queue application transactions while file discovery runs concurrently.
let writer = Promise.resolve();
function withWriteTransaction(work, db = (0, connection_js_1.getDb)()) {
    const result = writer.then(async () => {
        const tx = await db.transaction('write');
        try {
            const value = await work(tx);
            await tx.commit();
            return value;
        }
        catch (error) {
            await tx.rollback();
            throw error;
        }
        finally {
            tx.close();
        }
    });
    writer = result.catch(() => undefined);
    return result;
}
