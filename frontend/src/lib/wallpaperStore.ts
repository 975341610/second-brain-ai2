interface WallpaperEntry {
  id: string;
  data: ArrayBuffer | Blob;
  type: string;
  name: string;
  updated_at: string;
}

const DB_NAME = 'second-brain-assets';
const STORE_NAME = 'wallpapers';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openIndexedDb(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Failed to open IndexedDB database: ${name}`));
  });
}

function runReadonlyTransaction<T>(db: IDBDatabase, storeName: string, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`IndexedDB readonly transaction failed for ${storeName}`));
    tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB readonly transaction failed for ${storeName}`));
  });
}

function runReadwriteTransaction(db: IDBDatabase, storeName: string, action: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    try {
      action(store);
    } catch (error) {
      reject(error);
      return;
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`IndexedDB readwrite transaction failed for ${storeName}`));
    tx.onabort = () => reject(tx.error ?? new Error(`IndexedDB readwrite transaction aborted for ${storeName}`));
  });
}

function getDB() {
  if (!dbPromise) {
    dbPromise = openIndexedDb(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    });
  }
  return dbPromise;
}

export const wallpaperStore = {
  async setWallpaper(id: string, data: ArrayBuffer | Blob, type: string, name: string) {
    const db = await getDB();
    await runReadwriteTransaction(db, STORE_NAME, (store) => {
      store.put({
        id,
        data,
        type,
        name,
        updated_at: new Date().toISOString(),
      });
    });
    return `idb://${id}`;
  },

  async getWallpaper(id: string): Promise<WallpaperEntry | undefined> {
    const db = await getDB();
    return runReadonlyTransaction(db, STORE_NAME, (store) => store.get(id));
  },

  async deleteWallpaper(id: string) {
    const db = await getDB();
    await runReadwriteTransaction(db, STORE_NAME, (store) => {
      store.delete(id);
    });
  },

  async listWallpapers(): Promise<WallpaperEntry[]> {
    const db = await getDB();
    return runReadonlyTransaction(db, STORE_NAME, (store) => store.getAll()) as Promise<WallpaperEntry[]>;
  },

  async resolveIdbUrl(url: string): Promise<{ url: string; type: string } | string | null> {
    if (!url.startsWith('idb://')) return url;
    const id = url.replace('idb://', '');
    const entry = await this.getWallpaper(id);
    if (!entry) return null;

    const blob = entry.data instanceof ArrayBuffer
      ? new Blob([entry.data], { type: entry.type })
      : entry.data;

    return {
      url: URL.createObjectURL(blob),
      type: entry.type,
    };
  },
};
