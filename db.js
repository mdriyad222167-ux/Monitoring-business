/* db.js — IndexedDB access. All multi-store writes happen inside ONE transaction. */
(function () {
  'use strict';
  const DB_NAME = 'mizan-business-monitor';
  const DB_VERSION = 1;
  const STORES = ['products', 'stockMovements', 'customers', 'sales', 'payments', 'expenses', 'meta'];
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('This browser does not support IndexedDB. Please use a modern browser.'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        const db = req.result;
        if (!db.objectStoreNames.contains('products')) {
          const s = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name');
          s.createIndex('category', 'category');
        }
        if (!db.objectStoreNames.contains('stockMovements')) {
          const s = db.createObjectStore('stockMovements', { keyPath: 'id', autoIncrement: true });
          s.createIndex('productId', 'productId');
        }
        if (!db.objectStoreNames.contains('customers')) {
          const s = db.createObjectStore('customers', { keyPath: 'id', autoIncrement: true });
          s.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('sales')) {
          const s = db.createObjectStore('sales', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date');
          s.createIndex('customerId', 'customerId');
        }
        if (!db.objectStoreNames.contains('payments')) {
          const s = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
          s.createIndex('customerId', 'customerId');
          s.createIndex('saleId', 'saleId');
        }
        if (!db.objectStoreNames.contains('expenses')) {
          const s = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () {
        const db = req.result;
        db.onversionchange = function () { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('Could not open the database.')); };
      req.onblocked = function () { reject(new Error('Database is blocked by another open tab. Close other tabs and reload.')); };
    });
    return dbPromise;
  }

  const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  // Run fn(stores) inside one readwrite transaction. Throwing / rejecting aborts everything.
  async function transact(storeNames, mode, fn) {
    const db = await open();
    return new Promise(function (resolve, reject) {
      let tx;
      try { tx = db.transaction(storeNames, mode); } catch (e) { return reject(e); }
      const stores = {};
      storeNames.forEach(function (n) {
        const s = tx.objectStore(n);
        stores[n] = {
          get: (k) => wrap(s.get(k)),
          getAll: () => wrap(s.getAll()),
          getAllByIndex: (idx, key) => wrap(s.index(idx).getAll(key)),
          add: (v) => wrap(s.add(v)),
          put: (v) => wrap(s.put(v)),
          delete: (k) => wrap(s.delete(k)),
          clear: () => wrap(s.clear()),
        };
      });
      let result, failed = null;
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = function () { reject(failed || tx.error); };
      tx.onabort = function () { reject(failed || tx.error || new Error('Transaction aborted')); };
      Promise.resolve().then(() => fn(stores)).then(function (r) { result = r; }, function (e) {
        failed = e;
        try { tx.abort(); } catch (_) { /* already finished */ }
      });
    });
  }

  async function getAll(store) { return transact([store], 'readonly', (s) => s[store].getAll()); }
  async function get(store, key) { return transact([store], 'readonly', (s) => s[store].get(key)); }
  async function getMeta(key, fallback) {
    const r = await get('meta', key);
    return r ? r.value : fallback;
  }
  async function setMeta(key, value) { return transact(['meta'], 'readwrite', (s) => s.meta.put({ key: key, value: value })); }

  // Load everything (used by analytics & backup)
  async function loadAll() {
    return transact(STORES.filter((n) => n !== 'meta'), 'readonly', async function (s) {
      const out = {};
      for (const n of Object.keys(s)) out[n] = await s[n].getAll();
      return out;
    });
  }

  window.MZ = window.MZ || {};
  window.MZ.DB = { open, transact, getAll, get, getMeta, setMeta, loadAll, STORES, DB_NAME, DB_VERSION };
})();
