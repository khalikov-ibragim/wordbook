// Обёртка над IndexedDB. Три хранилища:
//   deviceDictionary — маленький офлайн-словарь, живёт прямо на устройстве
//   pendingEntries    — записи, созданные без сети, ждут отправки на сервер
//   entriesCache      — последний известный список записей (для чтения офлайн)

const DB_NAME = 'wordbook';
const DB_VERSION = 1;

function openDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('deviceDictionary')) {
                db.createObjectStore('deviceDictionary', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('pendingEntries')) {
                db.createObjectStore('pendingEntries', { keyPath: 'localId', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('entriesCache')) {
                db.createObjectStore('entriesCache', { keyPath: 'id' });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function tx(storeName, mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const result = fn(store);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
    });
}

const WordbookDB = {
    // --- офлайн-словарь на устройстве ---
    async lookupDeviceWord(word, pair) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const store = db.transaction('deviceDictionary', 'readonly').objectStore('deviceDictionary');
            const req = store.get(`${word.trim().toLowerCase()}|${pair}`);
            req.onsuccess = () => resolve(req.result ? req.result.translation : null);
            req.onerror = () => reject(req.error);
        });
    },

    // bulkWords: [{word, translation, pair}]  — используется при первой загрузке словаря в приложение
    async bulkImportDeviceDictionary(bulkWords) {
        return tx('deviceDictionary', 'readwrite', (store) => {
            bulkWords.forEach(({ word, translation, pair }) => {
                store.put({ key: `${word.trim().toLowerCase()}|${pair}`, translation });
            });
        });
    },

    async deviceDictionaryCount() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction('deviceDictionary', 'readonly').objectStore('deviceDictionary').count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    // --- записи, созданные офлайн, ждущие синхронизации ---
    async addPendingEntry(entry) {
        return tx('pendingEntries', 'readwrite', (store) => store.add(entry));
    },

    async getPendingEntries() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction('pendingEntries', 'readonly').objectStore('pendingEntries').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async removePendingEntry(localId) {
        return tx('pendingEntries', 'readwrite', (store) => store.delete(localId));
    },

    // Перезаписывает офлайн-запись целиком (используется при "Изменить" /
    // смене статуса для записей, которые ещё не синхронизировались).
    async updatePendingEntry(entry) {
        return tx('pendingEntries', 'readwrite', (store) => store.put(entry));
    },

    // --- кэш последнего известного списка записей (чтение офлайн) ---
    async cacheEntries(entries) {
        return tx('entriesCache', 'readwrite', (store) => {
            store.clear();
            entries.forEach((e) => store.put(e));
        });
    },

    async getCachedEntries() {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const req = db.transaction('entriesCache', 'readonly').objectStore('entriesCache').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
};
