'use strict';

const releaseData = document.getElementById('install-releases');
const releases = JSON.parse(releaseData.content.textContent);
const releaseSelect = document.getElementById('installed-release');
const changedOnly = document.getElementById('changed-only');
const releaseSummary = document.getElementById('release-summary');
const removedFiles = document.getElementById('removed-files');
const codeSections = [...document.querySelectorAll('.code-section')];

function updateReleaseComparison() {
  const selected = releaseSelect.value;
  const baseline = selected ? releases[selected] : null;
  changedOnly.disabled = !baseline;
  if (!baseline) changedOnly.checked = false;
  let changedCount = 0;
  for (const section of codeSections) {
    const name = section.dataset.fileName;
    const badge = section.querySelector('[data-file-status]');
    let state = 'unknown';
    let label = 'SIN REFERENCIA';
    if (baseline) {
      if (!Object.hasOwn(baseline, name)) {
        state = 'new';
        label = 'NUEVO';
      } else if (
        baseline[name] !== releases[releaseData.dataset.currentVersion][name]
      ) {
        state = 'changed';
        label = 'MODIFICADO';
      } else {
        state = 'same';
        label = 'SIN CAMBIOS';
      }
    }
    badge.dataset.state = state;
    badge.textContent = label;
    if (state === 'new' || state === 'changed') changedCount += 1;
    section.hidden =
      changedOnly.checked && state !== 'new' && state !== 'changed';
  }
  if (!selected) {
    releaseSummary.textContent =
      'Sin una versión de referencia, considera obligatorios los 15 archivos y revisa el código antes de instalar.';
    removedFiles.hidden = true;
    removedFiles.textContent = '';
  } else {
    releaseSummary.textContent = changedCount
      ? changedCount +
        ' de ' +
        codeSections.length +
        ' archivos son nuevos o modificados desde la versión ' +
        selected +
        '.'
      : 'No hay cambios de código frente a la versión ' + selected + '.';
    const currentNames = new Set(
      codeSections.map((section) => section.dataset.fileName),
    );
    const removed = Object.keys(baseline).filter(
      (name) => !currentNames.has(name),
    );
    removedFiles.hidden = removed.length === 0;
    removedFiles.textContent = removed.length
      ? 'Archivos retirados desde ' +
        selected +
        '. Haz una copia de seguridad y elimina estos archivos antiguos del proyecto de Apps Script: ' +
        removed.join(', ') +
        '.'
      : '';
  }
}

releaseSelect.addEventListener('change', updateReleaseComparison);
changedOnly.addEventListener('change', updateReleaseComparison);
updateReleaseComparison();

const copyStatus = document.getElementById('copy-status');
for (const button of document.querySelectorAll('[data-copy]'))
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy);
    try {
      await navigator.clipboard.writeText(code.textContent);
      const name = button
        .closest('.code-section')
        .querySelector('h2').textContent;
      copyStatus.textContent =
        name + ' copiado. Pégalo únicamente en ese archivo de Apps Script.';
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
