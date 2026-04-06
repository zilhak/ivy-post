import type { Comment, CommentCreate } from './types';

const DB_NAME = 'ivypost';
const STORE_NAME = 'comments';
const DB_VERSION = 1;

/** IndexedDB 열기 */
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('url', 'url', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

/** 트랜잭션 헬퍼 */
const withStore = async <T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

/** 로컬 댓글 저장 (폴백용) */
export const saveLocal = async (create: CommentCreate): Promise<Comment> => {
  const comment: Comment = {
    id: crypto.randomUUID(),
    ...create,
    resolved: false,
    createdAt: new Date().toISOString(),
    replies: [],
  };

  await withStore('readwrite', (store) => store.put(comment));
  return comment;
};

/** 로컬 댓글 조회 */
export const getLocal = async (url: string): Promise<Comment[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('url');
    const req = index.getAll(url);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

/** 로컬 댓글 삭제 */
export const deleteLocal = async (id: string): Promise<void> => {
  await withStore('readwrite', (store) => store.delete(id));
};

/** 로컬 전체 삭제 */
export const clearLocal = async (): Promise<void> => {
  await withStore('readwrite', (store) => store.clear());
};
