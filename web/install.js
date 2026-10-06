'use strict';

const copyStatus = document.getElementById('copy-status');
for (const button of document.querySelectorAll('[data-copy]'))
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(code.textContent);
      copyStatus.textContent =
        'Código copiado. Pégalo en el archivo correspondiente de Apps Script.';
      button.textContent = 'Copiado';
      setTimeout(() => {
        button.textContent = 'Copiar código';
      }, 2000);
    } catch {
      code.closest('details').open = true;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      code.focus();
      copyStatus.textContent =
        'El navegador no permite copiar automáticamente. El código está seleccionado: usa Copiar y pégalo en Apps Script.';
    }
  });
