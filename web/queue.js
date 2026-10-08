'use strict';

const FinanceSync = (() => {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uncertainResult = (result) =>
    ['WRITE_UNCERTAIN', 'RESPONSE_UNCERTAIN', 'BUSY'].includes(result?.error);
  class BrowserStore {
    constructor(indexedDB = globalThis.indexedDB) {
      this.indexedDB = indexedDB;
      this.db = null;
    }
    async open() {
      if (this.db) return this.db;
      if (!this.indexedDB) throw Error('STORAGE_UNAVAILABLE');
      this.db = await new Promise((resolve, reject) => {
        const r = this.indexedDB.open('finances-v1', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('books');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(Error('STORAGE_UNAVAILABLE'));
      });
      return this.db;
    }
    async get(key) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('books', 'readonly'),
          r = tx.objectStore('books').get(key);
        r.onsuccess = () =>
          resolve(r.result || { queue: [], snapshot: null, bookKey: null });
        r.onerror = () => reject(Error('STORAGE_UNAVAILABLE'));
      });
    }
    async update(key, change) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('books', 'readwrite'),
          store = tx.objectStore('books'),
          r = store.get(key);
        let result;
        r.onsuccess = () => {
          try {
            result = change(
              r.result || { queue: [], snapshot: null, bookKey: null },
            );
            store.put(result, key);
          } catch (error) {
            tx.abort();
            reject(error);
          }
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(Error('STORAGE_UNAVAILABLE'));
      });
    }
  }
  async function namespace(url, crypto = globalThis.crypto) {
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(url),
    );
    return Array.from(new Uint8Array(bytes), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  }
  class Queue {
    constructor(
      store,
      key,
      {
        uuid = () => globalThis.crypto.randomUUID(),
        now = () => new Date().toISOString(),
        locks = globalThis.navigator?.locks,
      } = {},
    ) {
      this.store = store;
      this.key = key;
      this.uuid = uuid;
      this.now = now;
      this.locks = locks;
      this.running = false;
    }
    async get() {
      const data = await this.store.get(this.key);
      // Recuperar también respuestas ambiguas guardadas por clientes anteriores.
      for (const item of data.queue)
        if (item.status === 'review' && uncertainResult(item.result))
          item.status = 'uncertain';
      return data;
    }
    async saveSnapshot(snapshot) {
      if (!snapshot.ok || !snapshot.bookKey) throw Error('INVALID_SNAPSHOT');
      return this.store.update(this.key, (data) => {
        if (data.bookKey && data.bookKey !== snapshot.bookKey)
          throw Error('BOOK_CHANGED');
        return {
          ...data,
          bookKey: snapshot.bookKey,
          snapshot: clone(snapshot),
        };
      });
    }
    async enqueue(operations, label, action = 'transact', products) {
      return this.store.update(this.key, (data) => {
        if (!data.snapshot?.revision || !data.bookKey)
          throw Error('READ_REQUIRED');
        const envelope = {
          action,
          requestId: this.uuid(),
          expectedRevision: data.snapshot.revision,
          ...(data.snapshot.supportsBookBinding
            ? { bookKey: data.bookKey }
            : {}),
        };
        if (action === 'transact') envelope.operations = clone(operations);
        else if (products) envelope.products = clone(products);
        data.queue.push({
          envelope,
          label,
          status: 'pending',
          createdAt: this.now(),
          bookKey: data.bookKey,
          result: null,
        });
        return data;
      });
    }
    async status(id, status, result) {
      return this.store.update(this.key, (data) => {
        const item = data.queue.find((q) => q.envelope.requestId === id);
        if (item) {
          item.status = status;
          item.result = result ? clone(result) : null;
          item.updatedAt = this.now();
        }
        return data;
      });
    }
    async discard(id) {
      return this.store.update(this.key, (data) => {
        const item = data.queue.find((q) => q.envelope.requestId === id);
        if (
          !item ||
          !['pending', 'review'].includes(item.status) ||
          uncertainResult(item.result)
        )
          throw Error('CANNOT_DISCARD');
        item.status = 'discarded';
        item.updatedAt = this.now();
        return data;
      });
    }
    async clear() {
      return this.store.update(this.key, (data) => {
        if (
          data.queue.some((q) =>
            ['pending', 'uncertain', 'review'].includes(q.status),
          )
        )
          throw Error('PENDING_OPERATIONS');
        return { queue: [], snapshot: null, bookKey: null };
      });
    }
    async run(client, notify = () => {}) {
      const work = async () => {
        if (this.running) return;
        this.running = true;
        try {
          const fresh = await client.read();
          if (!fresh.ok) throw Error(fresh.error || 'READ_FAILED');
          await this.saveSnapshot(fresh);
          notify();
          const items = (await this.get()).queue.filter((q) =>
            ['pending', 'uncertain'].includes(q.status),
          );
          for (const entry of items) {
            const item = (await this.get()).queue.find(
              (q) => q.envelope.requestId === entry.envelope.requestId,
            );
            if (!['pending', 'uncertain'].includes(item.status)) continue;
            const current = (await this.get()).snapshot;
            if (item.bookKey !== current.bookKey) throw Error('BOOK_CHANGED');
            let result;
            if (item.status === 'uncertain') {
              try {
                result = await client.requestStatus(item.envelope);
              } catch {
                notify();
                break;
              }
              if (!result.ok) {
                notify();
                break;
              }
              if (result.found === false) result = null;
            }
            if (!result) {
              if (
                item.status === 'pending' &&
                item.envelope.expectedRevision !== current.revision
              ) {
                await this.status(item.envelope.requestId, 'review', {
                  ok: false,
                  error: 'CONFLICT',
                  message:
                    'El libro cambió. Revisa la operación con los datos actuales.',
                });
                notify();
                continue;
              }
              // Guardar ANTES de enviar permite recuperar un cierre incluso tras aplicar el lote.
              await this.status(item.envelope.requestId, 'uncertain');
              notify();
              try {
                result = await client.submit(clone(item.envelope));
              } catch {
                notify();
                break;
              }
            }
            if (!result.ok) {
              const uncertain = uncertainResult(result);
              await this.status(
                item.envelope.requestId,
                uncertain ? 'uncertain' : 'review',
                result,
              );
              notify();
              if (uncertain) break;
              continue;
            }
            await this.status(item.envelope.requestId, 'confirmed', result);
            notify();
            const after = await client.read();
            if (!after.ok) throw Error(after.error || 'READ_FAILED');
            await this.saveSnapshot(after);
            // Solo avanzar sobres NUNCA enviados si la revisión procede de nuestro propio lote.
            if (after.revision === result.revision)
              await this.store.update(this.key, (data) => {
                data.queue
                  .filter(
                    (q) =>
                      q.status === 'pending' &&
                      q.envelope.expectedRevision ===
                        item.envelope.expectedRevision,
                  )
                  .forEach(
                    (q) => (q.envelope.expectedRevision = after.revision),
                  );
                return data;
              });
            notify();
          }
        } finally {
          this.running = false;
          notify();
        }
      };
      return this.locks
        ? this.locks.request(
            'finances-sync-' + this.key,
            { ifAvailable: true },
            (lock) => (lock ? work() : undefined),
          )
        : work();
    }
  }
  return { BrowserStore, Queue, namespace };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceSync;
