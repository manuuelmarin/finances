'use strict';

function numberInput(value, minimum, label) {
  const n = typeof value === 'string' && !value.trim() ? NaN : Number(value);
  if (!Number.isFinite(n) || n < minimum) throw new Error('Revisa ' + label + '.');
  return n;
}

function compoundInterest({ capital, monthly, annualReturn, years, inflation }) {
  capital = numberInput(capital, 0, 'el capital inicial');
  monthly = numberInput(monthly, 0, 'la aportación mensual');
  years = numberInput(years, 1, 'el plazo en años');
  annualReturn = numberInput(annualReturn, -99.999999, 'la rentabilidad anual') / 100;
  inflation = numberInput(inflation, -99.999999, 'la inflación anual') / 100;
  if (!Number.isSafeInteger(years)) throw new Error('El plazo debe ser un número entero de años.');
  const months = years * 12;
  const monthlyRate = Math.expm1(Math.log1p(annualReturn) / 12);
  const growth = Math.exp(months * Math.log1p(monthlyRate));
  const contributions = monthlyRate === 0 ? monthly * months
    : monthly * Math.expm1(months * Math.log1p(monthlyRate)) / monthlyRate;
  const nominal = capital * growth + contributions;
  const contributed = capital + monthly * months;
  const real = nominal / Math.pow(1 + inflation, years);
  if (![nominal, contributed, real].every(Number.isFinite)) throw new Error('El escenario supera el rango de cálculo. Reduce el plazo o los porcentajes.');
  return { nominal, real, contributed, gain: nominal - contributed };
}

function mortgage({ price, downPayment, annualRate, years, costs }) {
  price = numberInput(price, Number.MIN_VALUE, 'el precio de la vivienda');
  downPayment = numberInput(downPayment, 0, 'la entrada');
  annualRate = numberInput(annualRate, 0, 'el TIN anual') / 100;
  years = numberInput(years, 1, 'el plazo en años');
  costs = numberInput(costs, 0, 'los gastos iniciales');
  if (downPayment > price) throw new Error('La entrada no puede superar el precio de la vivienda.');
  if (!Number.isSafeInteger(years)) throw new Error('El plazo debe ser un número entero de años.');
  const principal = price - downPayment;
  const months = years * 12;
  const monthlyRate = annualRate / 12;
  const payment = monthlyRate === 0 ? principal / months
    : principal * monthlyRate / -Math.expm1(-months * Math.log1p(monthlyRate));
  const totalPaid = payment * months;
  const interest = Math.max(0, totalPaid - principal);
  const initialCash = downPayment + costs;
  if (![payment, totalPaid, interest, initialCash].every(Number.isFinite)) throw new Error('El escenario supera el rango de cálculo. Revisa los importes y el plazo.');
  return { principal, payment, totalPaid, interest, initialCash };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { compoundInterest, mortgage };
