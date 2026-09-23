// Client consistency (page 23): a delayed read never overwrites a newer confirmed record.

export interface Versioned {
  id: string;
  version: number;
}

export function mergeNewer<T extends Versioned>(current: T | null | undefined, incoming: T | null | undefined): T | null {
  if (!incoming) return current ?? null;
  if (!current || current.id !== incoming.id) return incoming;
  return incoming.version >= current.version ? incoming : current;
}

/** A per-pallet cache that only ever moves forward in version. */
export class ConfirmedCache<T extends Versioned> {
  private map = new Map<string, T>();

  accept(record: T): T {
    const kept = mergeNewer(this.map.get(record.id), record)!;
    this.map.set(record.id, kept);
    return kept;
  }

  get(id: string): T | undefined {
    return this.map.get(id);
  }
}
