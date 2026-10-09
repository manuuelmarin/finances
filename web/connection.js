'use strict';

const CONNECTION_TYPE = 'finances.connection.v1';
const DEPLOYMENT_STORAGE_KEY = 'finances.appsScriptUrl';

function validDeploymentUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://script.google.com' &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function acceptsConnectionMessage(event, pending) {
  if (
    !pending ||
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
    // El mensaje procede del iframe de HtmlService dentro de la ventana abierta.
    if (event.source !== pending.popup && event.source.top !== pending.popup)
      return false;
  } catch {
    return false;
  }
  const data = event.data;
  if (
    data.type !== CONNECTION_TYPE ||
    data.state !== pending.state ||
    typeof data.ok !== 'boolean'
  )
    return false;
  if (!data.ok) return typeof data.error === 'string';
  return (
    ['test', 'production'].includes(data.environment) &&
    data.modelVersion === 3 &&
    Number.isSafeInteger(data.sheetCount) &&
    data.sheetCount >= 10 &&
    typeof data.checkedAt === 'string' &&
    Number.isFinite(Date.parse(data.checkedAt))
  );
}

function savedDeployment(storage) {
  try {
    const value = storage.getItem(DEPLOYMENT_STORAGE_KEY);
    return validDeploymentUrl(value) ? value : null;
  } catch {
    return null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    acceptsConnectionMessage,
    validDeploymentUrl,
    savedDeployment,
  };
}

if (typeof document !== 'undefined') {
  if (window.top !== window.self) {
    for (const id of ['connect', 'setup-toggle'])
      document.getElementById(id).disabled = true;
  } else {
    const button = document.getElementById('connect');
    const card = document.getElementById('connection-card');
    const status = document.getElementById('status');
    const detail = document.getElementById('detail');
    const results = document.getElementById('results');
    const dialog = document.getElementById('setup-dialog');
    const urlInput = document.getElementById('deployment-url');
    const setupMessage = document.getElementById('connection-message');
    let deploymentUrl = null;
    window.dispatchEvent(new Event('finances:configuration'));
    let pending = null;
    let configuredLocally = false;

    function storage() {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    }

    function setupNotice(message) {
      setupMessage.textContent = message;
      setupMessage.hidden = !message;
    }

    function show(state, title, description) {
      card.dataset.state = state;
      status.textContent = title;
      detail.textContent = description;
      results.hidden = state !== 'success';
      for (const label of document.querySelectorAll(
        '[data-connection-label]',
      )) {
        label.textContent =
          {
            loaded: 'Datos cargados',
            offline: 'Copia local',
            loading: 'Cargando libro',
            error: 'Revisar lectura',
            readonly: 'Datos · solo lectura',
          }[document.documentElement.dataset.bookState] ||
          (state === 'success'
            ? 'Estructura comprobada'
            : state === 'error'
              ? 'Revisar conexión'
              : deploymentUrl
                ? 'Pendiente de comprobar'
                : 'Sin conectar');
      }
      for (const indicator of document.querySelectorAll(
        '[data-connection-indicator]',
      )) {
        const bookState = document.documentElement.dataset.bookState;
        indicator.dataset.state =
          bookState === 'loaded'
            ? 'success'
            : bookState === 'error'
              ? 'error'
              : ['offline', 'loading', 'readonly'].includes(bookState)
                ? 'pending'
                : state;
      }
    }

    function finish() {
      pending = null;
      button.disabled = !deploymentUrl;
      button.textContent = 'Comprobar conexión';
    }

    function ready() {
      button.disabled = !deploymentUrl;
      if (deploymentUrl)
        show(
          'pending',
          'Conexión preparada',
          'Enlace guardado. Comprueba la conexión o abre el libro.',
        );
      else
        show(
          'pending',
          'Sin conexión configurada',
          'Añade el enlace privado de Apps Script.',
        );
    }

    document.getElementById('setup-toggle').addEventListener('click', () => {
      urlInput.value = deploymentUrl || '';
      setupNotice('');
      dialog.showModal();
      urlInput.focus();
    });
    document
      .getElementById('setup-cancel')
      .addEventListener('click', () => dialog.close());
    document.getElementById('setup-save').addEventListener('click', () => {
      const value = urlInput.value.trim();
      if (!validDeploymentUrl(value)) {
        setupNotice(
          'Pega la URL de aplicación web de Google que termina en /exec, sin parámetros.',
        );
        urlInput.setAttribute('aria-invalid', 'true');
        urlInput.focus();
        return;
      }
      urlInput.removeAttribute('aria-invalid');
      deploymentUrl = value;
      configuredLocally = true;
      finish();
      let stored = false;
      try {
        storage().setItem(DEPLOYMENT_STORAGE_KEY, value);
        stored = true;
      } catch {
        /* Sesión privada sin almacenamiento. */
      }
      ready();
      dialog.close();
      window.dispatchEvent(new Event('finances:configuration'));
      detail.textContent = stored
        ? 'Enlace guardado en este navegador.'
        : 'URL preparada para esta sesión. El navegador no permite guardarla; vuelve a pegarla al abrir la app de nuevo.';
    });
    document.getElementById('setup-clear').addEventListener('click', () => {
      try {
        storage().removeItem(DEPLOYMENT_STORAGE_KEY);
      } catch {
        /* No hay almacenamiento disponible. */
      }
      configuredLocally = true;
      deploymentUrl = null;
      window.dispatchEvent(new Event('finances:configuration'));
      urlInput.value = '';
      urlInput.removeAttribute('aria-invalid');
      finish();
      ready();
      dialog.close();
    });

    button.addEventListener('click', async () => {
      if (!deploymentUrl || pending) return;
      const checking = {};
      pending = checking;
      button.disabled = true;
      button.textContent = 'Comprobando…';
      show(
        'pending',
        'Comprobando conexión',
        'Esperando la respuesta de Google.',
      );
      try {
        const data = await globalThis.FinanceBook.check('connection');
        if (pending === checking) received(data);
      } catch (error) {
        if (pending === checking)
          show(
            'error',
            'Conexión sin confirmar',
            globalThis.FinanceBook.errorText(error),
          );
      } finally {
        if (pending === checking) finish();
      }
    });

    function received(data) {
      for (const label of document.querySelectorAll(
        '[data-finance-environment]',
      ))
        label.textContent =
          data.environment === 'production'
            ? 'Libro principal'
            : 'Copia de pruebas';
      document.getElementById('sheet-count').textContent = String(
        data.sheetCount,
      );
      document.getElementById('model-version').textContent = String(
        data.modelVersion,
      );
      document.getElementById('checked-at').textContent =
        'Última comprobación: ' +
        new Date(data.checkedAt).toLocaleString('es-ES');
      show(
        'success',
        data.rpcReady ? 'Conexión verificada' : 'Conexión de solo lectura',
        data.rpcReady
          ? 'Lectura y canal privado disponibles.'
          : 'Actualiza Apps Script para habilitar las operaciones.',
      );
    }

    deploymentUrl = savedDeployment(storage());
    configuredLocally = Boolean(deploymentUrl);
    ready();
    fetch('./config.json', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('CONFIG_FAILED');
        return response.json();
      })
      .then((config) => {
        if (configuredLocally) return;
        if (validDeploymentUrl(config.appsScriptUrl))
          deploymentUrl = config.appsScriptUrl;
        ready();
      })
      .catch(() => {
        if (!configuredLocally)
          show(
            'error',
            'No se ha cargado la configuración',
            'Puedes pegar la URL desde Configurar conexión o recargar la página.',
          );
      });
  }
}
