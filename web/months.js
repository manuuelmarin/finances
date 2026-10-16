'use strict';

// Localized controls preserve the native YYYY-MM input and its change contract.
const FinanceMonths = (() => {
  const valid = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '');
  const native = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  );
  function enhance(input) {
    if (input.dataset.monthEnhanced) return;
    input.dataset.monthEnhanced = 'true';
    const originalLabel = input.closest('label');
    const title = originalLabel?.firstChild?.textContent?.trim() || 'Periodo';
    if (originalLabel) {
      const field = document.createElement('div');
      for (const attribute of originalLabel.attributes)
        if (attribute.name !== 'for')
          field.setAttribute(attribute.name, attribute.value);
      while (originalLabel.firstChild) field.append(originalLabel.firstChild);
      originalLabel.replaceWith(field);
    }
    const wrapper = document.createElement('span');
    wrapper.className = 'month-picker';
    const month = document.createElement('select');
    const year = document.createElement('input');
    month.setAttribute('aria-label', 'Mes · ' + title);
    year.setAttribute('aria-label', 'Año · ' + title);
    month.id = input.id + '-month';
    year.id = input.id + '-year';
    year.type = 'number';
    year.inputMode = 'numeric';
    year.min = '1900';
    year.max = '2199';
    for (let i = 0; i < 12; i++) {
      const name = new Intl.DateTimeFormat('es-ES', {
        month: 'long',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(2026, i, 1)));
      month.append(
        new Option(
          name[0].toLocaleUpperCase('es-ES') + name.slice(1),
          String(i + 1).padStart(2, '0'),
        ),
      );
    }
    input.after(wrapper);
    wrapper.append(month, year);
    input.classList.add('month-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    const sync = () => {
      const value = native.get.call(input);
      month.value = valid(value) ? value.slice(5) : '01';
      year.value = valid(value)
        ? value.slice(0, 4)
        : String(new Date().getFullYear());
      month.disabled = input.disabled;
      year.disabled = input.disabled;
      month.required = input.required;
      year.required = input.required;
    };
    // Existing renderers assign .value directly. Keep both views synchronized.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return native.get.call(input);
      },
      set(value) {
        native.set.call(input, value);
        sync();
      },
    });
    const update = () => {
      if (!year.checkValidity() || !/^\d{4}$/.test(year.value)) return;
      const value = year.value + '-' + month.value;
      if (!valid(value)) return;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    month.addEventListener('change', update);
    year.addEventListener('change', update);
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    input.form?.addEventListener('reset', () => setTimeout(sync, 0));
    new MutationObserver(sync).observe(input, {
      attributes: true,
      attributeFilter: ['disabled', 'required'],
    });
    sync();
  }
  function init() {
    document.querySelectorAll('input[type="month"]').forEach(enhance);
  }
  init();
  return { init };
})();
