/* IndexedDB 저장 — 이 브라우저에만 남습니다. 서버로 가지 않습니다. */

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

export const get = key => tx('readonly', s => s.get(key)).catch(() => null);
export const set = (key, val) => tx('readwrite', s => s.put(val, key)).catch(() => null);
export const del = key => tx('readwrite', s => s.delete(key)).catch(() => null);

export const KEY_DATA = 'history';     // 5개년 자료 캐시 (익명 — 이름 없음)
export const KEY_ROSTER = 'roster';    // 학생 명단 (실명 — 교사가 저장을 선택했을 때만)
export const KEY_LINK = 'linkkey';     // 접속 링크의 열쇠
export const KEY_MOCK = 'mock';        // 모의고사 명단 (실명 — 저장을 선택했을 때만)
export const KEY_CUT = 'cut';          // 정시 배치기준표 캐시 (대학 공개 자료 — 이름 없음)
export const KEY_JG = 'jg';           // 정시 지원가능 자료 (대학 공개 자료 — 이름 없음)
export const KEY_SEL = 'sel';          // 선택과목 자료 캐시 (대학 공개 자료 — 이름 없음)
export const KEY_CHOICE = 'choice';    // 학생 선택 결과 (실명 — 이 브라우저에만)

export async function clearRoster() { await del(KEY_ROSTER); }

export async function clearAll() {
  await del(KEY_DATA);
  await del(KEY_ROSTER);
  await del(KEY_MOCK);
  await del(KEY_CUT);
  await del(KEY_SEL);
  await del(KEY_CHOICE);
  await del(KEY_LINK);
}
