'use strict';

const views = ['home', 'book', 'budgets', 'tools', 'connection'];
function navigate(view, focus = false) {
  if (!views.includes(view)) view = 'home';
  for (const name of views)
    document.getElementById('view-' + name).hidden = name !== view;
  for (const item of document.querySelectorAll('nav [data-view]')) {
    if (item.dataset.view === view) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
  document.title =
    'Finanzas · ' +
    {
      home: 'Inicio',
      book: 'Tu libro',
      budgets: 'Presupuestos',
      tools: 'Herramientas',
      connection: 'Conexión',
    }[view];
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
    const view = link.dataset.view;
    if (!views.includes(view)) return;
    event.preventDefault();
    if (location.hash === '#' + view) navigate(view, true);
    else location.hash = view;
  });
window.addEventListener('hashchange', () => {
  const view = location.hash.slice(1);
  if (views.includes(view) || !view) navigate(view, true);
});
navigate(location.hash.slice(1));

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
