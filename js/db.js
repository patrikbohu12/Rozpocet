// Tenká obálka nad IndexedDB. Dáta zostávajú len v zariadení.

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('denny-rozpocet', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('expenses', { keyPath: 'id' });
        req.result.createObjectStore('settings');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    result = fn(tx);
  });
}

const wait = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(['expenses', 'settings'], 'readonly');
  const [expenses, settings] = await Promise.all([
    wait(tx.objectStore('expenses').getAll()),
    wait(tx.objectStore('settings').get('main')),
  ]);
  return { expenses, settings };
}

export const putExpense = (e) => run('expenses', 'readwrite', (tx) => { tx.objectStore('expenses').put(e); });
export const deleteExpense = (id) => run('expenses', 'readwrite', (tx) => { tx.objectStore('expenses').delete(id); });
export const putSettings = (s) => run('settings', 'readwrite', (tx) => { tx.objectStore('settings').put(s, 'main'); });

export const replaceAll = (expenses, settings) => run(['expenses', 'settings'], 'readwrite', (tx) => {
  const store = tx.objectStore('expenses');
  store.clear();
  for (const e of expenses) store.put(e);
  tx.objectStore('settings').put(settings, 'main');
});
