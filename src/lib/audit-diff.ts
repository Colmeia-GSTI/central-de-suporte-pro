// Pure utility for diffing JSONB old/new audit payloads.
// Returns added, removed and changed top-level keys.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];

export interface DiffEntry {
  key: string;
  oldValue: JsonValue | undefined;
  newValue: JsonValue | undefined;
}

export interface JsonbDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
}

function isPlainObject(v: unknown): v is Record<string, JsonValue> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

export function diffJsonb(
  oldData: JsonValue | null | undefined,
  newData: JsonValue | null | undefined,
): JsonbDiff {
  const oldObj = isPlainObject(oldData) ? oldData : {};
  const newObj = isPlainObject(newData) ? newData : {};

  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];

  const keys = new Set<string>([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const key of keys) {
    const inOld = key in oldObj;
    const inNew = key in newObj;
    if (inOld && !inNew) {
      removed.push({ key, oldValue: oldObj[key], newValue: undefined });
    } else if (!inOld && inNew) {
      added.push({ key, oldValue: undefined, newValue: newObj[key] });
    } else if (!deepEqual(oldObj[key], newObj[key])) {
      changed.push({ key, oldValue: oldObj[key], newValue: newObj[key] });
    }
  }

  return { added, removed, changed };
}
