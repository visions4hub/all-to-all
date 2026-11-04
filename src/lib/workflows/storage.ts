import type { WorkflowDef } from "./schema";

// Saved workflows live in this browser's IndexedDB only (never uploaded).
// Plain IndexedDB, no library: one database, one store keyed by id.
// Settings are stored with structured clone, so a logo file stays a File.

const DB_NAME = "all-to-all";
const STORE = "workflows";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is not available in this browser."));
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the database: close so it can proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("The workflow storage is blocked by another tab."));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? req.error);
        tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
      }),
  );
}

export async function listWorkflows(): Promise<WorkflowDef[]> {
  const all = await request<WorkflowDef[]>("readonly", (s) => s.getAll() as IDBRequest<WorkflowDef[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveWorkflow(def: WorkflowDef): Promise<void> {
  await request("readwrite", (s) => s.put(def));
}

export async function deleteWorkflow(id: string): Promise<void> {
  await request("readwrite", (s) => s.delete(id));
}

export async function clearWorkflows(): Promise<void> {
  await request("readwrite", (s) => s.clear());
}

export function newWorkflowId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `w${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
