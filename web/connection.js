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
    for (const label of document.querySelectorAll('[data-connection-label]')) {
      label.textContent =
        state === 'success'
          ? 'Lectura comprobada'
          : state === 'error'
            ? 'Revisar conexión'
            : deploymentUrl
              ? 'Pendiente de comprobar'
              : 'Sin conectar';
    }
    for (const indicator of document.querySelectorAll(
      '[data-connection-indicator]',
    )) {
      indicator.dataset.state = state;
    }
  }

  function finish() {
    if (pending) clearTimeout(pending.timeout);
    if (pending) clearInterval(pending.poll);
    pending = null;
    button.disabled = !deploymentUrl;
    button.textContent = 'Comprobar conexión';
  }

  function ready() {
    button.disabled = !deploymentUrl;
    if (deploymentUrl)
      show(
        'pending',
        'Lista para comprobar',
        'Abre Google con el botón y vuelve aquí para ver si se ha recibido la lectura.',
      );
    else
      show(
        'pending',
        'Conecta tu libro',
        'Instala el código en Google y guarda aquí la URL de tu implementación para hacer la primera lectura.',
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
      ? 'URL guardada en este navegador. Pulsa Comprobar conexión para verificar la lectura de Google.'
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

  button.addEventListener('click', () => {
    if (!deploymentUrl || pending) return;
    // Referencia automática y efímera de esta prueba, sin entrada manual de IDs.
    const state = crypto.randomUUID();
    const url = new URL(deploymentUrl);
    url.searchParams.set('state', state);
    const popup = window.open(url.href, '_blank', 'popup,width=480,height=720');
    if (!popup) {
      show(
        'error',
        'Google no se ha abierto',
        'Permite la ventana emergente para esta página y vuelve a comprobar la conexión.',
      );
      return;
    }
    button.disabled = true;
    button.textContent = 'Comprobando…';
    show(
      'pending',
      'Esperando la lectura de Google',
      'Completa el acceso en la ventana de Google. El resultado aparecerá aquí.',
    );
    pending = {
      state,
      popup,
      timeout: setTimeout(() => {
        show(
          'error',
          'No se ha recibido la lectura',
          'Si acabas de iniciar sesión en Google, vuelve a comprobar la conexión. Si continúa el aviso, falta revisar la implementación.',
        );
        finish();
      }, 120000),
      poll: setInterval(() => {
        if (!pending) return;
        try {
          if (popup.closed) {
            show(
              'error',
              'La comprobación se ha interrumpido',
              'Vuelve a comprobar con la sesión de Google abierta. Si persiste, revisa la implementación.',
            );
            finish();
          }
        } catch {
          /* Las redirecciones de Google pueden separar las ventanas. */
        }
      }, 700),
    };
  });

  window.addEventListener('message', (event) => {
    if (!acceptsConnectionMessage(event, pending)) return;
    const data = event.data;
    finish();
    if (!data.ok) {
      const errors = {
        ACCESS_DENIED: 'Accede con la cuenta propietaria del libro.',
        NOT_CONFIGURED: 'Falta terminar la configuración de Apps Script.',
        INVALID_REQUEST: 'Vuelve a iniciar la comprobación desde esta página.',
        INVALID_MODEL:
          'Revisa el libro conectado: sus pestañas, tablas y columnas deben corresponder al modelo 3.',
        READ_FAILED:
          'No se ha podido leer Google Sheets. Hay que revisar Apps Script.',
      };
      show(
        'error',
        'La conexión necesita revisión',
        errors[data.error] || errors.READ_FAILED,
      );
      return;
    }
    for (const label of document.querySelectorAll('[data-finance-environment]'))
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
      'Lectura de Sheets recibida',
      'Google ha leído ' +
        (data.environment === 'production'
          ? 'el libro principal'
          : 'la copia de pruebas') +
        ' y ha devuelto estos resultados.',
    );
  });

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
