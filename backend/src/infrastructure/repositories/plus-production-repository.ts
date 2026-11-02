import { Client } from '@libsql/client';
import { PlusProductionRow, PlusProductionSource } from '../../domain/plus-production-match.js';

export class SqlPlusProductionRepository implements PlusProductionSource {
  constructor(private readonly db: Pick<Client,'execute'>) {}
  async findLotFamily(itemCode: string, lotNo: string): Promise<PlusProductionRow[]> {
    const prefix = lotNo + '-';
    const result = await this.db.execute({
      sql: `SELECT id,item_code,batch_no,seq_no,prod_qty FROM plus_records
        WHERE item_code=? AND (batch_no=? OR substr(batch_no,1,?)=?)`,
      args: [itemCode,lotNo,prefix.length,prefix]
    });
    return result.rows.map(row => ({ id: String(row.id), itemCode: String(row.item_code), lotNo: String(row.batch_no),
      seqNo: String(row.seq_no), quantity: row.prod_qty === null ? null : Number(row.prod_qty) }));
  }
}
