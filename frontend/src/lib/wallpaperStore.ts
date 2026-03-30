import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'second-brain-assets';
const STORE_NAME = 'wallpapers';
const DB_VERSION = 1;

interface WallpaperEntry {
  id: string;
  data: ArrayBuffer | Blob;
  type: string;
  name: string;
  updated_at: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export const wallpaperStore = {
  async setWallpaper(id: string, data: ArrayBuffer | Blob, type: string, name: string) {
    const db = await getDB();
    await db.put(STORE_NAME, {
      id,
      data,
      type,
      name,
      updated_at: new Date().toISOString(),
    });
    return `idb://${id}`;
  },

  async getWallpaper(id: string): Promise<WallpaperEntry | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, id);
  },

  async deleteWallpaper(id: string) {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
  },

  async listWallpapers(): Promise<WallpaperEntry[]> {
    const db = await getDB();
    return db.getAll(STORE_NAME);
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
      type: entry.type
    };
  }
};
