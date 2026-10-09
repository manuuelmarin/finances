'use strict';

function numberInput(value, minimum, label) {
  const n =
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim())
      ? NaN
      : Number(value);
  if (!Number.isFinite(n) || n < minimum)
    throw new Error('Revisa ' + label + '.');
  return n;
}

function compoundInterest({
  capital,
  monthly,
  annualReturn,
  years,
  inflation,
}) {
  capital = numberInput(capital, 0, 'el capital inicial');
  monthly = numberInput(monthly, 0, 'la aportación mensual');
  years = numberInput(years, 1, 'el plazo en años');
  annualReturn =
    numberInput(annualReturn, -99.999999, 'la rentabilidad anual') / 100;
  inflation = numberInput(inflation, -99.999999, 'la inflación anual') / 100;
  if (!Number.isSafeInteger(years))
    throw new Error('El plazo debe ser un número entero de años.');
  const months = years * 12;
  const monthlyRate = Math.expm1(Math.log1p(annualReturn) / 12);
  const growth = Math.exp(months * Math.log1p(monthlyRate));
  const contributions =
    monthlyRate === 0
      ? monthly * months
      : (monthly * Math.expm1(months * Math.log1p(monthlyRate))) / monthlyRate;
  const nominal = capital * growth + contributions;
  const contributed = capital + monthly * months;
  const real = nominal / Math.pow(1 + inflation, years);
  if (![nominal, contributed, real].every(Number.isFinite))
    throw new Error(
      'El escenario supera el rango de cálculo. Reduce el plazo o los porcentajes.',
    );
  return { nominal, real, contributed, gain: nominal - contributed };
}

function mortgage({ price, downPayment, annualRate, years, costs }) {
  price = numberInput(price, Number.MIN_VALUE, 'el precio de la vivienda');
  downPayment = numberInput(downPayment, 0, 'la entrada');
  annualRate = numberInput(annualRate, 0, 'el TIN anual') / 100;
  years = numberInput(years, 1, 'el plazo en años');
  costs = numberInput(costs, 0, 'los gastos iniciales');
  if (downPayment > price)
    throw new Error('La entrada no puede superar el precio de la vivienda.');
  if (!Number.isSafeInteger(years))
    throw new Error('El plazo debe ser un número entero de años.');
  const principal = price - downPayment;
  const months = years * 12;
  const monthlyRate = annualRate / 12;
  const payment =
    monthlyRate === 0
      ? principal / months
      : (principal * monthlyRate) /
        -Math.expm1(-months * Math.log1p(monthlyRate));
  const totalPaid = payment * months;
  const interest = Math.max(0, totalPaid - principal);
  const initialCash = downPayment + costs;
  if (![payment, totalPaid, interest, initialCash].every(Number.isFinite))
    throw new Error(
      'El escenario supera el rango de cálculo. Revisa los importes y el plazo.',
    );
  return { principal, payment, totalPaid, interest, initialCash };
}

// A bounded monthly search keeps impossible goals and numeric limits explicit.
const GOAL_MAX_MONTHS = 120000;

function goalInputs({ capital, target, annualReturn }) {
  return {
    capital: numberInput(capital, 0, 'el capital inicial'),
    target: numberInput(target, Number.MIN_VALUE, 'el capital objetivo'),
    rate: Math.expm1(
      Math.log1p(
        numberInput(
          annualReturn,
          -99.999999,
          'la hipótesis de rentabilidad anual',
        ) / 100,
      ) / 12,
    ),
  };
}

function goalBalance(capital, monthly, rate, months) {
  if (months === 0) return capital;
  if (rate === 0) return capital + monthly * months;
  const exponent = months * Math.log1p(rate);
  const initial = capital === 0 ? 0 : capital * Math.exp(exponent);
  const additions = monthly === 0 ? 0 : (monthly * Math.expm1(exponent)) / rate;
  return initial + additions;
}

function goalAmounts(capital, monthly, rate, months) {
  const nominal = goalBalance(capital, monthly, rate, months);
  const contributed = capital + monthly * months;
  const gain = nominal - contributed;
  if (![nominal, contributed, gain].every(Number.isFinite))
    throw new Error(
      'El escenario supera el rango de cálculo. Revisa los importes y la rentabilidad.',
    );
  return { nominal, contributed, gain };
}

function timeToGoal(input) {
  const { capital, target, rate } = goalInputs(input);
  const monthly = numberInput(input.monthly, 0, 'la aportación mensual');
  if (capital >= target)
    return {
      reachable: true,
      months: 0,
      ...goalAmounts(capital, monthly, rate, 0),
    };
  // With negative returns, contributions approach a ceiling but never reach it.
  if (capital * rate + monthly <= 0 || (rate < 0 && target >= monthly / -rate))
    return { reachable: false, reason: 'unreachable' };
  if (goalBalance(capital, monthly, rate, GOAL_MAX_MONTHS) < target)
    return { reachable: false, reason: 'beyond-range' };
  let low = 0;
  let high = GOAL_MAX_MONTHS;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (goalBalance(capital, monthly, rate, middle) >= target) high = middle;
    else low = middle;
  }
  return {
    reachable: true,
    months: high,
    ...goalAmounts(capital, monthly, rate, high),
  };
}

function monthlyForGoal(input) {
  const { capital, target, rate } = goalInputs(input);
  const years = numberInput(input.years, Number.MIN_VALUE, 'el plazo en años');
  const months = Math.round(years * 12);
  if (
    !Number.isSafeInteger(months) ||
    months < 1 ||
    months > GOAL_MAX_MONTHS ||
    Math.abs(years * 12 - months) > 1e-8
  )
    throw new Error(
      'El plazo debe equivaler a meses completos, entre 1 mes y 10.000 años.',
    );
  const initial = goalBalance(capital, 0, rate, months);
  if (!Number.isFinite(initial))
    throw new Error(
      'El escenario supera el rango de cálculo. Reduce el plazo o la rentabilidad.',
    );
  const annuity =
    rate === 0 ? months : Math.expm1(months * Math.log1p(rate)) / rate;
  const exactMonthly = Math.max(0, (target - initial) / annuity);
  const monthly = Math.ceil(exactMonthly * 100) / 100;
  if (!Number.isFinite(monthly))
    throw new Error('La aportación requerida supera el rango de cálculo.');
  return { monthly, months, ...goalAmounts(capital, monthly, rate, months) };
}

function liquidityBuffer({ essentialMonthly, liquidCapital, targetMonths }) {
  essentialMonthly = numberInput(
    essentialMonthly,
    Number.MIN_VALUE,
    'el gasto esencial mensual',
  );
  liquidCapital = numberInput(liquidCapital, 0, 'el capital líquido');
  targetMonths = numberInput(
    targetMonths,
    Number.MIN_VALUE,
    'los meses de cobertura objetivo',
  );
  const coveredMonths = liquidCapital / essentialMonthly;
  const target = essentialMonthly * targetMonths;
  const gap = Math.max(0, target - liquidCapital);
  const surplus = Math.max(0, liquidCapital - target);
  if (![coveredMonths, target, gap, surplus].every(Number.isFinite))
    throw new Error(
      'El escenario supera el rango de cálculo. Revisa los importes.',
    );
  return { coveredMonths, target, gap, surplus };
}

function bindPlanningCalculators(doc) {
  const currency = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });
  const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  const duration = (months) => {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    return `${months} meses (${years} años y ${rest} meses)`;
  };
  const configurations = {
    'goal-time': {
      fields: ['capital', 'monthly', 'target', 'annualReturn'],
      calculate: timeToGoal,
      describe: (r) =>
        !r.reachable
          ? r.reason === 'unreachable'
            ? 'La meta no se alcanza con estas hipótesis. Revisa la aportación, el objetivo o la rentabilidad.'
            : 'La meta queda fuera del límite de cálculo de 10.000 años. Revisa el escenario.'
          : `${r.months === 0 ? 'Meta ya alcanzada' : 'Plazo estimado: ' + duration(r.months)}. Capital: ${currency.format(r.nominal)}. Capital aportado: ${currency.format(r.contributed)}. Rendimiento hipotético: ${currency.format(r.gain)}.`,
    },
    'goal-saving': {
      fields: ['capital', 'target', 'years', 'annualReturn'],
      calculate: monthlyForGoal,
      describe: (r) =>
        `Aportación mensual requerida: ${currency.format(r.monthly)} (redondeada hacia arriba al céntimo). Plazo: ${duration(r.months)}. Capital estimado: ${currency.format(r.nominal)}. Capital aportado: ${currency.format(r.contributed)}. Rendimiento hipotético: ${currency.format(r.gain)}.`,
    },
    liquidity: {
      fields: ['essentialMonthly', 'liquidCapital', 'targetMonths'],
      calculate: liquidityBuffer,
      describe: (r) =>
        `Cobertura actual: ${decimal.format(r.coveredMonths)} meses. Colchón objetivo: ${currency.format(r.target)}. ${r.gap > 0 ? 'Falta: ' + currency.format(r.gap) : 'Objetivo cubierto. Exceso sobre el objetivo: ' + currency.format(r.surplus)}.`,
    },
  };
  for (const [prefix, config] of Object.entries(configurations)) {
    const form = doc.getElementById(prefix + '-form');
    if (!form) continue;
    const result = doc.getElementById(prefix + '-result');
    const message = doc.getElementById(prefix + '-message');
    const clear = () => {
      result.hidden = true;
      message.hidden = true;
      message.textContent = '';
    };
    form.addEventListener('input', clear);
    form.addEventListener('reset', clear);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      clear();
      try {
        const inputs = Object.fromEntries(
          config.fields.map((field) => [
            field,
            doc.getElementById(prefix + '-' + field).value,
          ]),
        );
        result.textContent = config.describe(config.calculate(inputs));
        result.hidden = false;
      } catch (error) {
        message.textContent = error.message;
        message.hidden = false;
      }
    });
  }
}

if (typeof document !== 'undefined') bindPlanningCalculators(document);
if (typeof module !== 'undefined' && module.exports)
  module.exports = {
    compoundInterest,
    mortgage,
    timeToGoal,
    monthlyForGoal,
    liquidityBuffer,
    bindPlanningCalculators,
  };
