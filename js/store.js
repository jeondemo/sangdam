/* IndexedDB 저장 — 불러온 데이터는 이 브라우저에만 남습니다. */

const DB_NAME = 'gwacheon-counsel';
const DB_VER = 1;
const STORE = 'kv';

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const get = key => tx('readonly', s => s.get(key));
export const set = (key, val) => tx('readwrite', s => s.put(val, key));
export const del = key => tx('readwrite', s => s.delete(key));

export const KEY_HISTORY = 'history';
export const KEY_ROSTER = 'roster';

export async function loadAll() {
  try {
    const [history, roster] = await Promise.all([get(KEY_HISTORY), get(KEY_ROSTER)]);
    return { history: history || null, roster: roster || null };
  } catch (e) {
    console.warn('저장된 데이터를 읽지 못했습니다.', e);
    return { history: null, roster: null };
  }
}

export async function clearAll() {
  await del(KEY_HISTORY);
  await del(KEY_ROSTER);
}
