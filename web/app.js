'use strict';

const titles = {
  home: 'Resumen',
  book: 'Movimientos',
  investments: 'Inversiones',
  accounts: 'Cuentas',
  budgets: 'Planificación',
  salary: 'Salario',
  tools: 'Calculadoras',
  connection: 'Configuración',
};
const views = Object.keys(titles);
const legacyViews = { goals: 'budgets', activity: 'connection' };
function canonicalView(view) {
  return legacyViews[view] || view;
}
const navigationDialog = document.getElementById('navigation-dialog');
document.getElementById('mobile-menu').addEventListener('click', () => {
  navigationDialog.showModal();
});
document.getElementById('navigation-close').addEventListener('click', () => {
  navigationDialog.close();
});
function navigate(view, focus = false) {
  view = canonicalView(view);
  if (!views.includes(view)) view = 'home';
  if (navigationDialog.open) navigationDialog.close();
  for (const name of views)
    document.getElementById('view-' + name).hidden = name !== view;
  for (const item of document.querySelectorAll('nav [data-view]')) {
    if (item.dataset.view === view) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  document
    .getElementById('mobile-menu')
    .toggleAttribute(
      'data-active',
      !['home', 'book', 'investments', 'budgets'].includes(view),
    );
  document.title = 'Finanzas · ' + titles[view];
  window.dispatchEvent(
    new CustomEvent('finances:navigate', { detail: { view } }),
  );
  if (focus) {
    const heading = document
      .getElementById('view-' + view)
      .querySelector('h1, h2');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

for (const link of document.querySelectorAll('[data-view]'))
  link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const view = canonicalView(link.dataset.view);
    if (!views.includes(view)) return;
    event.preventDefault();
    if (navigationDialog.open) navigationDialog.close();
    if (location.hash === '#' + view) navigate(view, true);
    else location.hash = view;
  });
window.addEventListener('hashchange', () => {
  const requested = location.hash.slice(1);
  const view = canonicalView(requested);
  if (views.includes(view) || !requested) {
    if (requested && view !== requested)
      history.replaceState(null, '', '#' + view);
    navigate(view, true);
  }
});
const initialHash = location.hash.slice(1);
const initialView = canonicalView(initialHash);
if (initialHash && initialHash !== initialView && views.includes(initialView))
  history.replaceState(null, '', '#' + initialView);
navigate(initialView);

const euros = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});
const value = (id) => document.getElementById(id).value;
function calculatorMessage(id, text) {
  const element = document.getElementById(id);
  element.textContent = text;
  element.hidden = !text;
}
function updateResults(prefix, values) {
  for (const [id, amount] of Object.entries(values))
    document.getElementById(id).textContent = euros.format(amount);
  document.getElementById(prefix + '-result').hidden = false;
  calculatorMessage(prefix + '-message', '');
}

document
  .getElementById('inflation-form')
  .addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const r = compoundInterest({
        capital: value('inflation-capital'),
        monthly: value('inflation-monthly'),
        annualReturn: value('inflation-return'),
        years: value('inflation-years'),
        inflation: value('inflation-rate'),
      });
      updateResults('inflation', {
        'inflation-result-value': r.nominal,
        'inflation-result-real': r.real,
        'inflation-result-contributed': r.contributed,
        'inflation-result-gain': r.gain,
      });
    } catch (error) {
      document.getElementById('inflation-result').hidden = true;
      calculatorMessage('inflation-message', error.message);
    }
  });
document.getElementById('mortgage-form').addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const r = mortgage({
      price: value('mortgage-price'),
      downPayment: value('mortgage-down-payment'),
      annualRate: value('mortgage-rate'),
      years: value('mortgage-years'),
      costs: value('mortgage-costs'),
    });
    updateResults('mortgage', {
      'mortgage-payment': r.payment,
      'mortgage-total-interest': r.interest,
      'mortgage-total-paid': r.totalPaid,
      'mortgage-initial-cash': r.initialCash,
    });
  } catch (error) {
    document.getElementById('mortgage-result').hidden = true;
    calculatorMessage('mortgage-message', error.message);
  }
});
for (const prefix of ['inflation', 'mortgage']) {
  const form = document.getElementById(prefix + '-form');
  form.addEventListener('reset', () => {
    document.getElementById(prefix + '-result').hidden = true;
    calculatorMessage(prefix + '-message', '');
  });
  form.addEventListener('input', () => {
    document.getElementById(prefix + '-result').hidden = true;
    calculatorMessage(prefix + '-message', '');
  });
}

const repaymentForm = document.getElementById('repayment-form');
repaymentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  document.getElementById('repayment-result').hidden = true;
  calculatorMessage('repayment-message', '');
  try {
    const input = Object.fromEntries(
      [
        'outstanding',
        'months',
        'annualRate',
        'repayment',
        'feeRate',
        'availableCash',
      ].map((field) => [field, value('repayment-' + field)]),
    );
    const r = mortgageRepayment(input);
    const body = document.getElementById('repayment-comparison');
    body.replaceChildren();
    for (const [label, scenario] of [
      ['Sin amortizar', r.baseline],
      ['Reducir cuota', r.reducedPayment],
      ['Reducir plazo', r.reducedTerm],
    ]) {
      const row = document.createElement('tr');
      for (const [index, text] of [
        label,
        euros.format(scenario.payment),
        String(scenario.months),
        euros.format(scenario.interest),
        euros.format(scenario.netSavings || 0),
      ].entries()) {
        const cell = document.createElement(index === 0 ? 'th' : 'td');
        if (index === 0) cell.scope = 'row';
        cell.textContent = text;
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
    document.getElementById('repayment-summary').textContent =
      `Amortización: ${euros.format(r.repayment)}. Comisión: ${euros.format(r.fee)}.` +
      (r.remainingCash === null
        ? ''
        : ` Efectivo restante: ${euros.format(r.remainingCash)}${r.remainingCash < 0 ? ' (el efectivo indicado no cubre amortización y comisión)' : ''}.`);
    document.getElementById('repayment-result').hidden = false;
  } catch (error) {
    calculatorMessage('repayment-message', error.message);
  }
});
for (const event of ['input', 'reset'])
  repaymentForm.addEventListener(event, () => {
    document.getElementById('repayment-result').hidden = true;
    calculatorMessage('repayment-message', '');
  });

const themeSelect = document.getElementById('theme-preference');
const themeStorageKey = 'finances.theme';
function savedTheme() {
  try {
    return localStorage.getItem(themeStorageKey) || 'system';
  } catch {
    return 'system';
  }
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeSelect) themeSelect.value = theme;
}
applyTheme(savedTheme());
themeSelect?.addEventListener('change', () => {
  applyTheme(themeSelect.value);
  try {
    localStorage.setItem(themeStorageKey, themeSelect.value);
  } catch {}
});
