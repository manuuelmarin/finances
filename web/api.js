'use strict';

const API_REQUEST_TYPE = 'finances.api.request.v1';
const API_RESPONSE_TYPE = 'finances.api.response.v1';
const API_PROGRESS_TYPE = 'finances.api.progress.v1';
const API_TRANSPORT = 'finances.rpc.json.v1';

function acceptsApiEnvelope(event, session, callId) {
  if (
    !session ||
    !session.source ||
    event.source !== session.source ||
    event.origin !== session.origin ||
    !event.source ||
    !event.data ||
    typeof event.data !== 'object'
  )
    return false;
  if (
    !/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+-)?script\.googleusercontent\.com)$/.test(
      event.origin,
    )
  )
    return false;
  try {
    if (event.source !== session.popup && event.source.top !== session.popup)
      return false;
  } catch {
    return false;
  }
  const data = event.data;
  return (
    [API_RESPONSE_TYPE, API_PROGRESS_TYPE].includes(data.type) &&
    data.state === session.state &&
    data.callId === callId
  );
}
function acceptsApiMessage(event, session, callId) {
  const data = event.data;
  return Boolean(
    acceptsApiEnvelope(event, session, callId) &&
    data.type === API_RESPONSE_TYPE &&
    data.result &&
    typeof data.result === 'object' &&
    typeof data.result.ok === 'boolean',
  );
}

class FinanceApiClient {
  constructor(deploymentUrl, runtime = globalThis) {
    const valid =
      typeof validDeploymentUrl === 'function'
        ? validDeploymentUrl
        : require('./connection.js').validDeploymentUrl;
    if (!valid(deploymentUrl)) throw new Error('INVALID_DEPLOYMENT');
    this.url = deploymentUrl;
    this.runtime = runtime;
    this.session = null;
    this.revision = null;
    this.bookKey = null;
    this.supportsBookBinding = false;
    this.pending = new Set();
    this.onProgress = null;
  }
  // Llamar desde un clic para que el navegador permita abrir Google.
  connect() {
    this.close();
    if (this.runtime.top && this.runtime.top !== this.runtime.self)
      return Promise.reject(new Error('EMBEDDED_CONTEXT'));
    const state = this.runtime.crypto.randomUUID(),
      url = new URL(this.url);
    url.searchParams.set('state', state);
    url.searchParams.set('read', '1');
    const popup = this.runtime.open(
      url.href,
      '_blank',
      'popup,width=480,height=720',
    );
    if (!popup) return Promise.reject(new Error('POPUP_BLOCKED'));
    const session = { state, popup };
    this.session = session;
    return new Promise((resolve, reject) => {
      let timer, poll;
      const release = () => {
        this.runtime.removeEventListener('message', listener);
        this.runtime.clearTimeout(timer);
        if (poll) this.runtime.clearInterval(poll);
        this.pending.delete(cancel);
      };
      const cancel = () => {
        release();
        reject(new Error('NOT_CONNECTED'));
      };
      const listener = (event) => {
        if (
          this.session !== session ||
          !acceptsConnectionMessage(event, session)
        )
          return;
        release();
        if (!event.data.ok) {
          this.close();
          reject(new Error(event.data.error || 'INVALID_RESPONSE'));
          return;
        }
        if (
          event.data.apiVersion !== '3.3.0' ||
          event.data.apiTransport !== API_TRANSPORT ||
          (event.data.rpcReady !== true &&
            !(event.data.readOnly === true && event.data.snapshot))
        ) {
          this.close();
          reject(new Error('UPDATE_REQUIRED'));
          return;
        }
        this.session.source = event.source;
        this.supportsBookBinding = event.data.supportsBookBinding === true;
        this.session.origin = event.origin;
        this.session.initialSnapshot = event.data.snapshot || null;
        this.session.rpcReady = event.data.rpcReady === true;
        this.session.transportError = event.data.transportError || null;
        resolve(event.data);
      };
      timer = this.runtime.setTimeout(() => {
        release();
        if (this.session === session) this.close();
        reject(new Error('CONNECTION_TIMEOUT'));
      }, 90000);
      if (typeof this.runtime.setInterval === 'function')
        poll = this.runtime.setInterval(() => {
          if (!popup.closed) return;
          release();
          if (this.session === session) this.close();
          reject(new Error('GOOGLE_WINDOW_CLOSED'));
        }, 500);
      this.pending.add(cancel);
      this.runtime.addEventListener('message', listener);
    });
  }
  request(body) {
    if (!this.session || !this.session.source || this.session.popup.closed)
      return Promise.reject(new Error('NOT_CONNECTED'));
    if (this.session.rpcReady === false)
      return Promise.reject(
        new Error(this.session.transportError || 'TRANSPORT_UNAVAILABLE'),
      );
    const callId = this.runtime.crypto.randomUUID(),
      session = this.session;
    const writing = ['transact', 'refreshPrices'].includes(body?.action);
    return new Promise((resolve, reject) => {
      let timer,
        poll,
        done = false;
      const error = (code) => {
        const e = new Error(writing ? 'RESPONSE_UNCERTAIN' : code);
        e.envelope = body;
        return e;
      };
      const cancel = () => finish(error('NOT_CONNECTED'));
      const finish = (failure, result) => {
        if (done) return;
        done = true;
        this.runtime.removeEventListener('message', listener);
        this.runtime.clearTimeout(timer);
        if (poll) this.runtime.clearInterval(poll);
        this.pending.delete(cancel);
        if (failure) reject(failure);
        else {
          if (body.action !== 'read') this.acceptResult(result);
          resolve(result);
        }
      };
      const listener = (event) => {
        if (
          this.session !== session ||
          !acceptsApiEnvelope(event, session, callId)
        )
          return;
        if (event.data.type === API_PROGRESS_TYPE) {
          if (event.data.phase === 'received')
            this.onProgress?.({ action: body.action, phase: 'received' });
          return;
        }
        if (!acceptsApiMessage(event, session, callId)) {
          finish(error('INVALID_RESPONSE'));
          return;
        }
        finish(null, event.data.result);
      };
      timer = this.runtime.setTimeout(() => {
        finish(error('READ_TIMEOUT'));
      }, 90000);
      if (typeof this.runtime.setInterval === 'function')
        poll = this.runtime.setInterval(() => {
          if (session.popup.closed) finish(error('GOOGLE_WINDOW_CLOSED'));
        }, 500);
      this.pending.add(cancel);
      this.runtime.addEventListener('message', listener);
      try {
        session.source.postMessage(
          {
            type: API_REQUEST_TYPE,
            state: session.state,
            callId,
            request: body,
          },
          session.origin,
        );
      } catch {
        finish(error('READ_CHANNEL_FAILED'));
      }
    });
  }
  acceptResult(result) {
    if (result.revision && result.ok && !result.replayed)
      this.revision = result.revision;
    if (result.bookKey && result.ok) this.bookKey = result.bookKey;
    if (result.supportsBookBinding === true) this.supportsBookBinding = true;
  }
  async read() {
    let result;
    // Esta primera copia procede del doGet autenticado; el siguiente read usa RPC.
    if (this.session?.initialSnapshot) {
      result = this.session.initialSnapshot;
      this.session.initialSnapshot = null;
    } else result = await this.request({ action: 'read' });
    if (!result.ok) return result;
    if (
      result.apiVersion !== '3.3.0' ||
      !/^[0-9a-f]{64}$/.test(result.bookKey) ||
      typeof result.revision !== 'string' ||
      !['test', 'production'].includes(result.environment) ||
      !Number.isFinite(Date.parse(result.checkedAt)) ||
      !result.settings ||
      !['start', 'asof', 'valuation'].every((k) =>
        /^\d{4}-\d{2}-\d{2}$/.test(result.settings[k]),
      ) ||
      !result.tables ||
      ![
        'tMovimientos',
        'tCuentas',
        'tProductos',
        'tCategorias',
        'tDeudas',
        'tOperaciones',
        'tPrecios',
        'tNominas',
        'tObjetivos',
        'tAsignaciones',
        'tVinculos',
      ].every((k) => Array.isArray(result.tables[k])) ||
      !result.summary ||
      !Array.isArray(result.summary.metrics) ||
      !Array.isArray(result.summary.missingPrices)
    )
      throw Error('INVALID_SNAPSHOT');
    this.acceptResult(result);
    return result;
  }
  async diagnostics() {
    return this.request({ action: 'diagnostics' });
  }
  async acceptance() {
    return this.request({ action: 'acceptance' });
  }
  quotePrices(funds) {
    return this.request({ action: 'quotePrices', funds });
  }
  preparePrices(products) {
    if (!this.revision) throw new Error('READ_REQUIRED');
    return JSON.parse(
      JSON.stringify({
        action: 'refreshPrices',
        requestId: this.runtime.crypto.randomUUID(),
        expectedRevision: this.revision,
        ...(this.bookKey && this.supportsBookBinding
          ? { bookKey: this.bookKey }
          : {}),
        ...(products ? { products } : {}),
      }),
    );
  }
  prepare(operations) {
    if (!this.revision) throw new Error('READ_REQUIRED');
    // Conservar este objeto sin cambios si se pierde la respuesta.
    return JSON.parse(
      JSON.stringify({
        action: 'transact',
        requestId: this.runtime.crypto.randomUUID(),
        expectedRevision: this.revision,
        ...(this.bookKey && this.supportsBookBinding
          ? { bookKey: this.bookKey }
          : {}),
        operations,
      }),
    );
  }
  submit(envelope) {
    return this.request(envelope);
  }
  requestStatus(envelope) {
    return this.request({
      action: 'requestStatus',
      requestId: envelope.requestId,
      ...(envelope.bookKey ? { bookKey: envelope.bookKey } : {}),
    });
  }
  close() {
    for (const cancel of this.pending) cancel();
    if (this.session && this.session.popup && !this.session.popup.closed)
      this.session.popup.close();
    this.session = null;
    this.revision = null;
    this.bookKey = null;
    this.supportsBookBinding = false;
  }
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { acceptsApiMessage, FinanceApiClient };

if (typeof document !== 'undefined') {
  const acceptanceButton = document.getElementById('acceptance-check'),
    acceptanceOutput = document.getElementById('acceptance-result');
  if (acceptanceButton && acceptanceOutput)
    acceptanceButton.addEventListener('click', async () => {
      let client;
      try {
        const url = savedDeployment(window.localStorage);
        if (!url) throw Error('NOT_CONFIGURED');
        client = new FinanceApiClient(url);
        const connected = client.connect();
        acceptanceButton.disabled = true;
        acceptanceOutput.textContent =
          'Abre Google para comprobar resumen y fuentes. No se guardarán precios.';
        await connected;
        const result = await client.acceptance();
        if (!result.ok) throw Error(result.message || result.error);
        const names = {
          backend: 'estructura',
          calculations: 'cálculos',
          summary: 'resumen',
          bridge: 'conexión',
          sources: 'fuentes de precios',
          stable: 'lectura sin cambios',
        };
        const missing = Object.entries(result.checks)
          .filter(([, ready]) => !ready)
          .map(([key]) => names[key]);
        acceptanceOutput.textContent =
          (result.environment === 'production'
            ? 'Libro principal'
            : 'Copia de pruebas') +
          ' · versión ' +
          result.buildVersion +
          ' · ' +
          (missing.length
            ? 'Revisar: ' + missing.join(', ') + '.'
            : 'Comprobaciones técnicas correctas.') +
          ' No se han guardado precios ni operaciones. ' +
          result.results
            .filter((r) => !r.ok)
            .map((r) => r.referenceName + ': ' + (r.message || r.error))
            .join(' ');
      } catch (error) {
        acceptanceOutput.textContent =
          'No se ha completado la comprobación: ' +
          error.message +
          '. Los datos del libro se conservan.';
      } finally {
        client?.close();
        acceptanceButton.disabled = false;
      }
    });
  const button = document.getElementById('backend-check'),
    output = document.getElementById('backend-result');
  if (button && output)
    button.addEventListener('click', async () => {
      let url;
      try {
        url = savedDeployment(window.localStorage);
      } catch (error) {}
      if (!url) {
        output.textContent = 'Configura primero el enlace de Google.';
        return;
      }
      const client = new FinanceApiClient(url);
      button.disabled = true;
      output.textContent = 'Abriendo Google para comprobar el backend…';
      try {
        await client.connect();
        const result = await client.diagnostics();
        if (!result.ok) output.textContent = result.message || result.error;
        else if (result.calculationReady === false)
          output.textContent =
            'Google responde, pero hay fórmulas que necesitan revisión. Consulta el resultado de comprobarPaso3.';
        else if (!result.backendReady)
          output.textContent =
            'El código responde. Ejecuta comprobarPaso3 en Apps Script para preparar el backend.';
        else
          output.textContent =
            'Backend verificado: API ' +
            result.apiVersion +
            ' · ' +
            result.tableCount +
            ' tablas · ' +
            (result.environment === 'production'
              ? 'libro principal'
              : 'copia de pruebas') +
            '. No se han registrado operaciones.';
      } catch (error) {
        output.textContent =
          error.message === 'UPDATE_REQUIRED'
            ? 'Actualiza los tres archivos de Apps Script y publica una nueva versión.'
            : error.message === 'POPUP_BLOCKED'
              ? 'Permite abrir la ventana de Google y repite la comprobación.'
              : 'No se ha confirmado la lectura. Revisa la implementación y vuelve a comprobarla.';
      } finally {
        client.close();
        button.disabled = false;
      }
    });
}
