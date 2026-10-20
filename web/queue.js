'use strict';

const FinanceSync = (() => {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uncertainResult = (result) =>
    [
      'WRITE_UNCERTAIN',
      'RESPONSE_UNCERTAIN',
      'BUSY',
      'API_FAILED',
      'RECEIPT_MISMATCH',
    ].includes(result?.error);
  // Older receipts lack action/bookKey, but still identify their UUID and results.
  function receiptMatches(envelope, result, snapshot) {
    if (
      result?.ok !== true ||
      result.found === false ||
      result.requestId !== envelope.requestId ||
      typeof result.revision !== 'string' ||
      !result.revision ||
      !Array.isArray(result.results) ||
      (result.action !== undefined && result.action !== envelope.action) ||
      (result.bookKey !== undefined && result.bookKey !== snapshot.bookKey) ||
      (result.environment !== undefined &&
        result.environment !== snapshot.environment)
    )
      return false;
    if (envelope.action === 'transact')
      return (
        result.results.length === envelope.operations.length &&
        result.results.every(
          (row, i) =>
            row?.process === envelope.operations[i].process &&
            (![
              'gasto',
              'ingreso',
              'nomina',
              'traspaso',
              'cobro_compartido',
              'devolucion_gasto',
              'prestamo',
              'pago_deuda',
            ].includes(row.process) ||
              row.id === 'MOV-' + envelope.requestId + '-' + (i + 1)),
        )
      );
    if (envelope.action === 'refreshPrices')
      return (
        result.results.length > 0 &&
        result.results.every(
          (row) =>
            typeof row?.product === 'string' && typeof row.status === 'string',
        )
      );
    if (envelope.action === 'importPriceHistory')
      return (
        result.results.length === envelope.rows.length &&
        result.results.every(
          (row, i) =>
            row?.date === envelope.rows[i].date &&
            row.price === envelope.rows[i].price,
        )
      );
    return false;
  }
  function movementReadback(item, snapshot) {
    const ids = (item.result?.results || [])
      .filter((row) => typeof row?.id === 'string' && row.id.startsWith('MOV-'))
      .map((row) => row.id);
    if (!ids.length) return null;
    const rows = snapshot?.tables?.tMovimientos;
    return {
      ids,
      present:
        Array.isArray(rows) &&
        ids.every((id) => rows.some((row) => row.ID === id)),
    };
  }
  function readbackIssue(item, snapshot) {
    if (movementReadback(item, snapshot)?.present === false)
      return 'POST_CONFIRM_MOVEMENT_MISSING';
    if (
      item.result?.revision !== item.envelope.expectedRevision &&
      snapshot.revision === item.envelope.expectedRevision
    )
      return 'POST_CONFIRM_SNAPSHOT_STALE';
    return null;
  }
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
    async list() {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('books', 'readonly');
        const rows = [];
        const request = tx.objectStore('books').openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            rows.push({ key: cursor.key, ...cursor.value });
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve(rows);
        tx.onerror = () => reject(Error('STORAGE_UNAVAILABLE'));
      });
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
        tx.oncomplete = () => {
          this.changed?.(key, result);
          resolve(result);
        };
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
        readbackReady = () => true,
        locks = globalThis.navigator?.locks,
      } = {},
    ) {
      this.store = store;
      this.key = key;
      this.uuid = uuid;
      this.now = now;
      this.readbackReady = readbackReady;
      this.locks = locks;
      this.running = false;
      this.owner = uuid();
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
        for (const item of data.queue)
          if (item.awaitingRead && !this.readbackIssue(item, snapshot)) {
            delete item.awaitingRead;
            // Only advance never-sent envelopes when this read matches our
            // receipt exactly, including recovery after a failed first read.
            if (snapshot.revision === item.result.revision)
              for (const pending of data.queue)
                if (
                  pending.status === 'pending' &&
                  pending.envelope.expectedRevision ===
                    item.envelope.expectedRevision
                )
                  pending.envelope.expectedRevision = snapshot.revision;
          }
        if (data.queue.some((item) => item.awaitingRead)) return data;
        return {
          ...data,
          bookKey: snapshot.bookKey,
          snapshot: clone(snapshot),
          label:
            snapshot.environment === 'production'
              ? 'Libro principal'
              : 'Copia de pruebas',
        };
      });
    }
    readbackIssue(item, snapshot) {
      return (
        readbackIssue(item, snapshot) ||
        (this.readbackReady(snapshot)
          ? null
          : 'POST_CONFIRM_CALCULATIONS_STALE')
      );
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
        else if (action === 'importPriceHistory') {
          envelope.product = products.product;
          envelope.rows = clone(products.rows);
          envelope.sourceVerified = products.sourceVerified === true;
        } else if (products) envelope.products = clone(products);
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
    async claim(id, exclusive = false) {
      let claimed = null;
      await this.store.update(this.key, (data) => {
        claimed = null;
        const item = data.queue.find((q) => q.envelope.requestId === id);
        if (item?.status === 'review' && uncertainResult(item.result))
          item.status = 'uncertain';
        if (!item || !['pending', 'uncertain'].includes(item.status))
          return data;
        // An exclusive holder proves only an earlier lock-protected sender ended.
        if (
          item.claim &&
          item.claim.until > Date.now() &&
          !(exclusive && item.claim.protectedByLock === true)
        )
          return data;
        const originalStatus = item.status;
        item.status = 'uncertain';
        item.claim = {
          owner: this.owner,
          until: Date.now() + 300000,
          protectedByLock: exclusive,
        };
        item.updatedAt = this.now();
        claimed = { ...clone(item), originalStatus };
        return data;
      });
      return claimed;
    }
    async release(id) {
      return this.store.update(this.key, (data) => {
        const item = data.queue.find((q) => q.envelope.requestId === id);
        if (item?.claim?.owner === this.owner) delete item.claim;
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
          // Confirmation and the following read are separate durable steps.
          // A failed read must survive reopening without resubmitting the write.
          if (status === 'confirmed') item.awaitingRead = true;
          if (
            ['confirmed', 'review'].includes(status) ||
            (status === 'uncertain' &&
              result &&
              item.claim?.owner === this.owner)
          )
            delete item.claim;
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
          throw Error(
            item?.status === 'uncertain'
              ? 'CANNOT_DISCARD_IN_FLIGHT'
              : 'CANNOT_DISCARD',
          );
        item.status = 'discarded';
        item.updatedAt = this.now();
        return data;
      });
    }
    async clear() {
      return this.store.update(this.key, (data) => {
        if (
          data.queue.some(
            (q) =>
              q.awaitingRead || !['confirmed', 'discarded'].includes(q.status),
          )
        )
          throw Error('PENDING_OPERATIONS');
        return { queue: [], snapshot: null, bookKey: null };
      });
    }
    async run(client, notify = () => {}) {
      const work = async (exclusive = false) => {
        if (this.running) return { status: 'busy', reason: 'OTHER_WINDOW' };
        const outcome = { status: 'confirmed', reason: null, confirmed: 0 };
        let claimedId = null;
        this.running = true;
        try {
          const fresh = await client.read();
          if (!fresh.ok) throw Error(fresh.error || 'READ_FAILED');
          await this.saveSnapshot(fresh);
          notify();
          const stored = await this.get();
          const unread = stored.queue.find((item) => item.awaitingRead);
          if (unread) {
            outcome.reason = this.readbackIssue(unread, fresh);
            return outcome;
          }
          if (stored.queue.some((item) => item.status === 'review')) {
            outcome.status = 'review';
            outcome.reason = 'REVIEW_REQUIRED';
          }
          const items = stored.queue.filter((q) =>
            ['pending', 'uncertain'].includes(q.status),
          );
          for (const entry of items) {
            const item = await this.claim(entry.envelope.requestId, exclusive);
            if (!item) {
              outcome.status = 'busy';
              outcome.reason = 'OTHER_WINDOW';
              continue;
            }
            claimedId = item.envelope.requestId;
            const current = (await this.get()).snapshot;
            if (item.bookKey !== current.bookKey) throw Error('BOOK_CHANGED');
            let result;
            if (item.originalStatus === 'uncertain') {
              try {
                result = await client.requestStatus(item.envelope);
              } catch (error) {
                outcome.status = 'unconfirmed';
                outcome.reason = error.message || 'STATUS_FAILED';
                await this.status(claimedId, 'uncertain', {
                  ok: false,
                  error: outcome.reason,
                });
                notify();
                break;
              }
              if (!result.ok) {
                outcome.status = 'unconfirmed';
                outcome.reason = result.error || 'STATUS_FAILED';
                await this.status(claimedId, 'uncertain', result);
                notify();
                break;
              }
              if (result.found === false) result = null;
            }
            if (!result) {
              if (
                item.originalStatus === 'pending' &&
                item.envelope.expectedRevision !== current.revision
              ) {
                await this.status(item.envelope.requestId, 'review', {
                  ok: false,
                  error: 'CONFLICT',
                  message:
                    'El libro cambió. Revisa la operación con los datos actuales.',
                });
                outcome.status = 'review';
                outcome.reason = 'CONFLICT';
                notify();
                continue;
              }
              // Guardar ANTES de enviar permite recuperar un cierre incluso tras aplicar el lote.
              await this.status(item.envelope.requestId, 'uncertain');
              notify();
              try {
                result = await client.submit(clone(item.envelope));
              } catch (error) {
                outcome.status = 'unconfirmed';
                outcome.reason = error.message || 'SUBMIT_FAILED';
                await this.status(claimedId, 'uncertain', {
                  ok: false,
                  error: outcome.reason,
                });
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
              outcome.status = uncertain ? 'unconfirmed' : 'review';
              outcome.reason = result.error;
              if (uncertain) break;
              continue;
            }
            if (!receiptMatches(item.envelope, result, current)) {
              await this.status(claimedId, 'uncertain', {
                ok: false,
                error: 'RECEIPT_MISMATCH',
                received: result,
              });
              outcome.status = 'unconfirmed';
              outcome.reason = 'RECEIPT_MISMATCH';
              notify();
              break;
            }
            await this.status(item.envelope.requestId, 'confirmed', result);
            outcome.confirmed++;
            notify();
            let after;
            try {
              after = await client.read();
              if (!after.ok) throw Error(after.error || 'READ_FAILED');
            } catch (error) {
              outcome.reason = 'POST_CONFIRM_READ_FAILED';
              outcome.readError = error.message;
              return outcome;
            }
            const saved = await this.saveSnapshot(after);
            const unread = saved.queue.find((item) => item.awaitingRead);
            if (unread) {
              outcome.reason = this.readbackIssue(unread, after);
              return outcome;
            }
            notify();
          }
          return outcome;
        } finally {
          if (claimedId) await this.release(claimedId);
          this.running = false;
          notify();
        }
      };
      return this.locks
        ? this.locks.request(
            'finances-sync-' + this.key,
            { ifAvailable: true },
            (lock) =>
              lock ? work(true) : { status: 'busy', reason: 'OTHER_WINDOW' },
          )
        : work();
    }
  }
  return { BrowserStore, Queue, namespace, receiptMatches, movementReadback };
})();
if (typeof module !== 'undefined' && module.exports)
  module.exports = FinanceSync;
