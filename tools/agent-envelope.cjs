// Adaptador de solicitudes para agentes. El transporte debe ser la API autenticada de Google.
const crypto = require('node:crypto');
function prepare(snapshot, operations) {
  if (
    snapshot?.apiVersion !== '3.3.0' ||
    snapshot?.environment !== 'test' ||
    !snapshot?.revision ||
    !snapshot?.bookKey
  )
    throw Error('READ_REQUIRED');
  if (
    !Array.isArray(operations) ||
    !operations.length ||
    operations.length > 20
  )
    throw Error('INVALID_OPERATIONS');
  return JSON.parse(
    JSON.stringify({
      action: 'transact',
      requestId: crypto.randomUUID(),
      expectedRevision: snapshot.revision,
      operations,
    }),
  );
}
async function submit(client, envelope, { persist }) {
  if (typeof persist !== 'function') throw Error('DURABLE_STORAGE_REQUIRED');
  await persist(envelope);
  try {
    return await client.submit(envelope);
  } catch {
    const stored = await client.requestStatus(envelope);
    if (stored.ok && stored.found !== false) return stored;
    throw Object.assign(Error('RESPONSE_UNCERTAIN'), { envelope });
  }
}
module.exports = { prepare, submit };
