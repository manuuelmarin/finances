// Cola para agentes: comparte sincronización, revisión e idempotencia con la app.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { Queue, namespace } = require('../web/queue.js');
const { validDeploymentUrl } = require('../web/connection.js');
class FileStore {
  constructor(file) {
    this.file = path.resolve(file);
  }
  async get() {
    try {
      return JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw Error('STORAGE_UNAVAILABLE');
    }
  }
  async update(key, change) {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    let lock, temp;
    try {
      lock = await fs.open(this.file + '.lock', 'wx', 0o600);
      const books = await this.get();
      const result = change(
        books[key] || { queue: [], snapshot: null, bookKey: null },
      );
      books[key] = result;
      temp = this.file + '.' + crypto.randomUUID() + '.tmp';
      const handle = await fs.open(temp, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(books));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, this.file);
      const dir = await fs.open(path.dirname(this.file), 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
      return result;
    } catch (error) {
      if (
        error.message === 'BOOK_CHANGED' ||
        error.message === 'PENDING_OPERATIONS' ||
        error.message === 'READ_REQUIRED' ||
        error.message === 'CANNOT_DISCARD'
      )
        throw error;
      throw Error(
        error.code === 'EEXIST' && !lock
          ? 'STORAGE_BUSY'
          : 'STORAGE_UNAVAILABLE',
      );
    } finally {
      if (temp) await fs.unlink(temp).catch(() => {});
      if (lock) {
        await lock.close();
        await fs.unlink(this.file + '.lock');
      }
    }
  }
}
async function openQueue({ directory, deploymentUrl }) {
  if (!directory || !validDeploymentUrl(deploymentUrl))
    throw Error('INVALID_CONFIGURATION');
  const key = await namespace(deploymentUrl, crypto.webcrypto),
    file = path.join(directory, key + '.json'),
    store = new FileStore(file);
  // FileStore guarda varios libros bajo claves; Queue espera el documento de su clave.
  const scoped = {
    get: async (key) =>
      (await store.get())[key] || { queue: [], snapshot: null, bookKey: null },
    update: (key, change) => store.update(key, change),
  };
  return new Queue(scoped, key, { locks: null });
}
module.exports = { FileStore, openQueue };
