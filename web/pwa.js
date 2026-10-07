'use strict';
(() => {
  let installEvent = null;
  const button = document.getElementById('install-app');
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    button.hidden = true;
  });
  if (!('serviceWorker' in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const showUpdate = () => {
        if (!registration.waiting) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-secondary';
        button.textContent = 'Actualizar app';
        button.addEventListener('click', () => {
          if (document.querySelector('dialog[open]')) {
            document.getElementById('finance-state').textContent =
              'Cierra los formularios antes de actualizar. Los pendientes guardados se conservan.';
            return;
          }
          registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
        });
        document.querySelector('.finance-toolbar').append(button);
      };
      showUpdate();
      registration.addEventListener('updatefound', () =>
        registration.installing?.addEventListener('statechange', () => {
          if (registration.waiting && navigator.serviceWorker.controller)
            showUpdate();
        }),
      );
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController && !reloading && navigator.serviceWorker.controller) {
          reloading = true;
          location.reload();
        }
      });
    })
    .catch(() => {
      const status = document.getElementById('pwa-status');
      status.textContent =
        ' · Instalación sin conexión no disponible en este navegador';
      status.hidden = false;
    });
})();
