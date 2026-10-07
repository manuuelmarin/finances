'use strict';

const API_REQUEST_TYPE = 'finances.api.request.v1';
const API_RESPONSE_TYPE = 'finances.api.response.v1';

function acceptsApiMessage(event, session, callId) {
  if (
    !session ||
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
    data.type === API_RESPONSE_TYPE &&
    data.state === session.state &&
    data.callId === callId &&
    data.result &&
    typeof data.result === 'object' &&
    typeof data.result.ok === 'boolean'
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
  }
  // Llamar desde un clic para que el navegador permita abrir Google.
  connect() {
    this.close();
    const state = this.runtime.crypto.randomUUID(),
      url = new URL(this.url);
    url.searchParams.set('state', state);
    const popup = this.runtime.open(
      url.href,
      '_blank',
      'popup,width=480,height=720',
    );
    if (!popup) return Promise.reject(new Error('POPUP_BLOCKED'));
    this.session = { state, popup };
    return new Promise((resolve, reject) => {
      let timer;
      const listener = (event) => {
        if (!acceptsConnectionMessage(event, this.session)) return;
        this.runtime.removeEventListener('message', listener);
        this.runtime.clearTimeout(timer);
        if (!event.data.ok) {
          this.close();
          reject(new Error(event.data.error));
          return;
        }
        if (event.data.apiVersion !== '3.3.0') {
          this.close();
          reject(new Error('UPDATE_REQUIRED'));
          return;
        }
        this.session.source = event.source;
        this.supportsBookBinding = event.data.supportsBookBinding === true;
        this.session.origin = event.origin;
        resolve(event.data);
      };
      timer = this.runtime.setTimeout(() => {
        this.runtime.removeEventListener('message', listener);
        this.close();
        reject(new Error('CONNECTION_TIMEOUT'));
      }, 90000);
      this.runtime.addEventListener('message', listener);
    });
  }
  request(body) {
    if (!this.session || !this.session.source || this.session.popup.closed)
      return Promise.reject(new Error('NOT_CONNECTED'));
    const callId = this.runtime.crypto.randomUUID(),
      session = this.session;
    return new Promise((resolve, reject) => {
      let timer;
      const listener = (event) => {
        if (!acceptsApiMessage(event, session, callId)) return;
        this.runtime.removeEventListener('message', listener);
        this.runtime.clearTimeout(timer);
        const result = event.data.result;
        if (result.revision && result.ok && !result.replayed)
          this.revision = result.revision;
        if (result.bookKey && result.ok) this.bookKey = result.bookKey;
        if (result.supportsBookBinding === true)
          this.supportsBookBinding = true;
        resolve(result);
      };
      timer = this.runtime.setTimeout(() => {
        this.runtime.removeEventListener('message', listener);
        const e = new Error('RESPONSE_UNCERTAIN');
        e.envelope = body;
        reject(e);
      }, 45000);
      this.runtime.addEventListener('message', listener);
      session.source.postMessage(
        { type: API_REQUEST_TYPE, state: session.state, callId, request: body },
        session.origin,
      );
    });
  }
  async read() {
    return this.request({ action: 'read' });
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
