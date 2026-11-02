/** Sequence numbers are identifiers: keep leading zeroes, remove pasted whitespace. */
export function normalizeSeqNo(value: string): string { return value.replace(/\s+/g, ''); }

export interface ItemMappingInput {
  itemName: string;
  seqNo: string;
  pcsPerSheet: number | null;
  process: string;
  build: string;
  model: string;
}

export interface ItemMappingStore {
  findKey(itemName: string, seqNo: string): Promise<{ id: string; is_deleted: number } | undefined>;
  save(id: string, input: ItemMappingInput, actorId: string | null, exists: boolean): Promise<void>;
}
