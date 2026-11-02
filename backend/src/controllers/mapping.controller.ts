import { mappingInput } from '../application/mapping-input.js';
import { ItemMappingRepository } from '../infrastructure/repositories/item-mapping-repository.js';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../database/connection.js';
import { auditedMutation } from '../composition/audited-mutation.js';
import { CvrMatchingEngine } from '../modules/matcher/cvr-matching-engine.js';
import { sseManager } from '../modules/realtime/sse-manager.js';
import { Client } from '@libsql/client';
import { NotFoundError, ConflictError } from '../errors/app-error.js';

export async function getMappingsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const { search, status } = req.query;
    const isDeletedFilter = status === 'deleted' ? 1 : 0;
    const conditions = ['is_deleted = ?'];
    const args: any[] = [isDeletedFilter];

    if (search) {
      conditions.push('(item_name LIKE ? OR seq_no LIKE ? OR process LIKE ? OR build LIKE ? OR model LIKE ?)');
      const s = `%${search}%`;
      args.push(s, s, s, s, s);
    }

    const rows = await db.execute({
      sql: `SELECT * FROM item_mapping WHERE ${conditions.join(' AND ')} ORDER BY item_name ASC, seq_no ASC;`,
      args
    });

    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
}


async function mutateMapping(req: Request, res: Response, next: NextFunction,
  work: (tx: Pick<Client,'execute'>) => Promise<{ id: string; message: string; status?: number }>) {
  try {
    const action = req.path.endsWith('/restore') ? 'RESTORE' : req.method === 'DELETE' ? 'DELETE' : req.method === 'POST' ? 'CREATE' : 'UPDATE';
    const result = await auditedMutation({ id: req.user!.id,username: req.user!.username,ip: req.clientIp },
      'item_mapping',action,req.params.id,async tx => {
        const result = await work(tx);
        await new CvrMatchingEngine(() => tx).rematchCvrRecords();
        return result;
      });
    req.auditRecorded = true;
    sseManager.broadcast({ event: 'record_updated', data: { resource: 'item_mapping', id: result.id } });
    res.status(result.status || 200).json({ success: true, message: result.message, data: { id: result.id } });
  } catch (error) { next(error); }
}

export async function createMappingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  await mutateMapping(req, res, next, async tx => {
    const input = mappingInput(req.body);
    const repository = new ItemMappingRepository(tx);
    const old = await repository.findKey(input.itemName,input.seqNo);
    if (old && !old.is_deleted) throw new ConflictError('Item name + Seq no đã tồn tại trong bảng mapping');
    const id = old ? String(old.id) : 'map-' + crypto.randomUUID();
    await repository.save(id,input,req.user?.id || null,Boolean(old));
    return { id, message: old ? 'Đã khôi phục và cập nhật item mapping' : 'Đã thêm item mapping', status: old ? 200 : 201 };
  });
}

export async function updateMappingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  await mutateMapping(req, res, next, async tx => {
    const input = mappingInput(req.body);
    const id = req.params.id;
    const existing = await tx.execute({ sql: 'SELECT id FROM item_mapping WHERE id=? AND is_deleted=0', args: [id] });
    if (!existing.rows.length) throw new NotFoundError('Không tìm thấy item mapping');
    const repository = new ItemMappingRepository(tx);
    const conflict = await repository.findKey(input.itemName,input.seqNo);
    if (conflict && conflict.id !== id) throw new ConflictError('Item name + Seq no đã tồn tại');
    await repository.save(id,input,req.user?.id || null,true);
    return { id, message: 'Đã cập nhật item mapping' };
  });
}

async function setDeleted(req: Request, res: Response, next: NextFunction, deleted: number) {
  await mutateMapping(req, res, next, async tx => {
    const id = req.params.id;
    const existing = await tx.execute({ sql: 'SELECT id FROM item_mapping WHERE id=? AND is_deleted=?', args: [id,1-deleted] });
    if (!existing.rows.length) throw new NotFoundError('Không tìm thấy item mapping');
    await tx.execute({ sql: 'UPDATE item_mapping SET is_deleted=?,updated_by=?,updated_at=? WHERE id=?',
      args: [deleted,req.user?.id || null,new Date().toISOString(),id] });
    return { id, message: deleted ? 'Đã xóa mềm item mapping' : 'Đã khôi phục item mapping' };
  });
}
export async function softDeleteMappingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  await setDeleted(req,res,next,1);
}
export async function restoreMappingController(req: Request, res: Response, next: NextFunction): Promise<void> {
  await setDeleted(req,res,next,0);
}
