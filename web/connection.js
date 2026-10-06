'use strict';

const CONNECTION_TYPE = 'finances.connection.v1';

function validDeploymentUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://script.google.com' &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname) &&
      !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

function acceptsConnectionMessage(event, pending) {
  if (!pending || !event.source || !event.data || typeof event.data !== 'object') return false;
  if (!/^https:\/\/(?:script\.google\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(event.origin)) return false;
  try {
    // El mensaje procede del iframe de HtmlService dentro de la ventana abierta.
    if (event.source !== pending.popup && event.source.top !== pending.popup) return false;
  } catch { return false; }
  const data = event.data;
  if (data.type !== CONNECTION_TYPE || data.state !== pending.state || typeof data.ok !== 'boolean') return false;
  if (!data.ok) return typeof data.error === 'string';
  return data.environment === 'test' &&
    Number.isSafeInteger(data.modelVersion) && data.modelVersion > 0 &&
    Number.isSafeInteger(data.sheetCount) && data.sheetCount > 0 &&
    typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { acceptsConnectionMessage, validDeploymentUrl };
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('connect');
  const card = document.getElementById('connection-card');
  const status = document.getElementById('status');
  const detail = document.getElementById('detail');
  const results = document.getElementById('results');
  let deploymentUrl = null;
  let pending = null;

  function show(state, title, description) {
    card.dataset.state = state;
    status.textContent = title;
    detail.textContent = description;
    results.hidden = state !== 'success';
  }

  function finish() {
    if (pending) clearTimeout(pending.timeout);
    pending = null;
    button.disabled = !deploymentUrl;
    button.textContent = 'Comprobar conexión';
  }

  button.addEventListener('click', () => {
    if (!deploymentUrl || pending) return;
    // Referencia automática y efímera de esta prueba, sin entrada manual de IDs.
    const state = crypto.randomUUID();
    const url = new URL(deploymentUrl);
    url.searchParams.set('state', state);
    const popup = window.open(url.href, '_blank', 'popup,width=480,height=720');
    if (!popup) {
      show('error', 'Google no se ha abierto', 'Permite la ventana emergente para esta página y vuelve a comprobar la conexión.');
      return;
    }
    button.disabled = true;
    button.textContent = 'Comprobando…';
    show('pending', 'Esperando la lectura de Google', 'Completa el acceso en la ventana de Google. El resultado aparecerá aquí.');
    pending = { state, popup, timeout: setTimeout(() => {
      show('error', 'No se ha recibido la lectura', 'Si acabas de iniciar sesión en Google, vuelve a comprobar la conexión. Si continúa el aviso, falta revisar la implementación.');
      finish();
    }, 120000) };
  });

  window.addEventListener('message', (event) => {
    if (!acceptsConnectionMessage(event, pending)) return;
    const data = event.data;
    finish();
    if (!data.ok) {
      const errors = {
        ACCESS_DENIED: 'Accede con la cuenta propietaria de la copia de pruebas.',
        NOT_CONFIGURED: 'Falta terminar la configuración de Apps Script.',
        INVALID_REQUEST: 'Vuelve a iniciar la comprobación desde esta página.',
        INVALID_MODEL: 'La lectura no ha devuelto un modelo válido.',
        READ_FAILED: 'No se ha podido leer Google Sheets. Hay que revisar Apps Script.'
      };
      show('error', 'La conexión necesita revisión', errors[data.error] || errors.READ_FAILED);
      return;
    }
    document.getElementById('sheet-count').textContent = String(data.sheetCount);
    document.getElementById('model-version').textContent = String(data.modelVersion);
    document.getElementById('checked-at').textContent = 'Última comprobación: ' +
      new Date(data.checkedAt).toLocaleString('es-ES');
    show('success', 'Lectura de Sheets recibida', 'Google ha leído la copia de pruebas y ha devuelto estos resultados.');
  });

  fetch('./config.json', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) throw new Error('CONFIG_FAILED');
      return response.json();
    })
    .then(config => {
      if (!validDeploymentUrl(config.appsScriptUrl)) {
        show('pending', 'Pendiente de conectar Google', 'La página está preparada. Falta configurar el acceso de Google y la conexión con la copia de pruebas.');
        return;
      }
      deploymentUrl = config.appsScriptUrl;
      button.disabled = false;
      show('pending', 'Lista para comprobar', 'Pulsa el botón para leer la copia de pruebas a través de Google.');
    })
    .catch(() => show('error', 'No se ha cargado la configuración', 'Recarga la página para volver a intentarlo.'));
}
