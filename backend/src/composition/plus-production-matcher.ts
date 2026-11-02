import { Client } from '@libsql/client';
import { PlusProductionMatcher } from '../application/plus-production-matcher.js';
import { WcsLotKey } from '../domain/plus-production-match.js';
import { SqlPlusProductionRepository } from '../infrastructure/repositories/plus-production-repository.js';
import { SqlWcsLotRepository } from '../infrastructure/repositories/wcs-lot-repository.js';

export function createPlusProductionMatcher(db: Pick<Client,'execute'>, incoming: readonly WcsLotKey[] = []) {
  return new PlusProductionMatcher(new SqlPlusProductionRepository(db),new SqlWcsLotRepository(db,incoming));
}
