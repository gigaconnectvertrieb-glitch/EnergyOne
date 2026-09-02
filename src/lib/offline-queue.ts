import type { ContractDraft } from "@/lib/server/api";

const DB = "e1-feld";
const QUEUE = "contracts";
const TARIFFS = "tariffs";

type Queued = { id: string; at: string; data: ContractDraft };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(TARIFFS)) db.createObjectStore(TARIFFS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueContract(data: ContractDraft) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, "readwrite");
    tx.objectStore(QUEUE).put({ id: `off-${Date.now()}-${Math.random().toString(16).slice(2)}`, at: new Date().toISOString(), data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueued() {
  const db = await openDb();
  return new Promise<Queued[]>((resolve, reject) => {
    const tx = db.transaction(QUEUE, "readonly");
    const req = tx.objectStore(QUEUE).getAll();
    req.onsuccess = () => resolve((req.result || []) as Queued[]);
    req.onerror = () => reject(req.error);
  });
}

export async function dropQueued(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE, "readwrite");
    tx.objectStore(QUEUE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheTariffs(rows: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TARIFFS, "readwrite");
    tx.objectStore(TARIFFS).put(rows, "catalog");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function readCachedTariffs<T>() {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(TARIFFS, "readonly");
    const req = tx.objectStore(TARIFFS).get("catalog");
    req.onsuccess = () => resolve((req.result as T) || null);
    req.onerror = () => reject(req.error);
  });
}

export function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
