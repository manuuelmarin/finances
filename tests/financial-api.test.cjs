const {test}=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const {runtime,serial}=require('./helpers/runtime.cjs');
const expense=(changes={})=>({process:'gasto',date:'2026-01-02',concept:'Gasto ficticio',account:'Cuenta A',category:'Café',amount:12,recurring:false,...changes});
const payroll=(changes={})=>({process:'nomina',date:'2026-01-02',concept:'Nómina ficticia',account:'Cuenta A',category:'Nómina',amount:100,...changes});
const trade=(changes={})=>({process:'compra',date:'2026-01-02',concept:'Compra ficticia',product:'Fondo A',units:2,price:3.1234,fee:.1,...changes});

test('autoriza antes de cualquier lectura o escritura y mantiene el libro solo en configuración del servidor',()=>{
  for(const visitor of ['', 'other@example.test']) {const r=runtime({visitor});assert.equal(r.api({action:'read'}).error,'ACCESS_DENIED');assert.equal(r.init().error,'ACCESS_DENIED');assert.equal(r.writes.length,0);}
  const r=runtime();assert.equal(r.api({action:'read',spreadsheetId:'another'}).error,'INVALID_REQUEST');
});
test('preparación idempotente conserva entradas, fórmulas y observación antigua sin inventar una hora',()=>{
  const r=runtime(), inputs=JSON.stringify(r.state().tables), formulas=r.formulas();assert.equal(r.init().ok,true);assert.equal(r.init().ok,true);
  assert.equal(r.writes.length,1);assert.equal(r.book().sheets.length,13);assert.equal(JSON.stringify(r.state().tables),inputs);assert.deepEqual(r.formulas(),formulas);
  const result=r.api({action:'read'});assert.equal(result.backendReady,true);assert.equal(result.observations[0].scope,'desconocido');assert.equal(result.observations[0].time,null);assert.equal(result.observations[0].difference,null);
});
test('un reintento persistido devuelve los mismos IDs sin duplicar; no se reutiliza la solicitud con otros datos',()=>{
  const r=runtime();r.init();const envelope={action:'transact',requestId:crypto.randomUUID(),expectedRevision:r.state().revision,operations:[expense()]};
  const first=r.api(envelope), again=r.api(envelope);assert.equal(first.ok,true);assert.equal(again.replayed,true);assert.deepEqual(again.results,first.results);
  assert.equal(r.state().tables.tMovimientos.length,1);assert.equal(r.state().technical.requests.length,1);
  assert.equal(r.api({...envelope,operations:[expense({amount:13})]}).error,'REQUEST_CONFLICT');
  assert.equal(r.api({action:'requestStatus',requestId:envelope.requestId}).replayed,true);
});
test('respuesta perdida después de aplicar el lote se recupera del registro persistido',()=>{
  const r=runtime();r.init();r.options.loseResponseOnce=true;const result=r.transact([expense()]);
  assert.equal(result.ok,true);assert.equal(result.replayed,true);assert.equal(r.state().tables.tMovimientos.length,1);assert.equal(r.state().technical.requests.length,1);
});
test('fallo antes de aplicar conserva el libro y permite reintentar exactamente la misma solicitud',()=>{
  const r=runtime();r.init();const envelope={action:'transact',requestId:crypto.randomUUID(),expectedRevision:r.state().revision,operations:[expense()]};r.options.failBeforeWrite=true;
  assert.equal(r.api(envelope).error,'WRITE_UNCERTAIN');assert.equal(r.state().tables.tMovimientos.length,0);assert.equal(r.state().technical.requests.length,0);
  r.options.failBeforeWrite=false;assert.equal(r.api(envelope).ok,true);assert.equal(r.state().tables.tMovimientos.length,1);
});
test('revisión detecta cambios de otro dispositivo o una edición manual y el bloqueo evita concurrencia',()=>{
  const r=runtime();r.init();const old=r.state().revision;r.setInput('tCuentas',0,'Saldo inicial',1001);
  assert.equal(r.api({action:'transact',requestId:crypto.randomUUID(),expectedRevision:old,operations:[expense()]}).error,'CONFLICT');
  r.options.busy=true;assert.equal(r.transact([expense()]).error,'BUSY');assert.equal(r.state().tables.tMovimientos.length,0);
});
test('compra y caja se guardan en un único batch junto con solicitudes y auditoría, sin tocar fórmulas',()=>{
  const r=runtime();r.init();const f=r.formulas(), before=r.writes.length;const result=r.transact([trade()]);assert.equal(result.ok,true);
  assert.equal(r.writes.length,before+1);const s=r.state();assert.equal(s.tables.tOperaciones[0].Movimiento,s.tables.tMovimientos[0].ID);assert.equal(s.tables.tMovimientos[0].Importe,6.35);
  assert.equal(s.tables.tOperaciones[0].Participaciones,2);assert.equal(s.technical.requests.length,1);assert.ok(s.technical.audit.length>=2);assert.deepEqual(r.formulas(),f);
});
test('venta excesiva o lote inválido se rechaza entero sin dejar efectivo huérfano',()=>{
  const r=runtime();r.init();const count=r.writes.length;
  assert.equal(r.transact([expense(),trade({process:'venta',units:6})]).error,'INVALID_DATA');assert.equal(r.writes.length,count);assert.equal(r.state().tables.tMovimientos.length,0);
});
test('compra histórica conserva el histórico sin volver a crear caja y respeta la base',()=>{
  const r=runtime();r.init();assert.equal(r.transact([trade({date:'2025-06-01',historical:true})]).ok,true);
  assert.equal(r.state().tables.tMovimientos.length,0);assert.equal(r.state().tables.tOperaciones.length,1);
  assert.equal(r.transact([trade({historical:true})]).error,'INVALID_DATA');assert.equal(r.transact([trade({date:'2024-01-01',historical:true})]).error,'INVALID_DATA');
});
test('corregir inversión actualiza caja y anular elimina ambos registros conservando auditoría',()=>{
  const r=runtime();r.init();const bought=r.transact([trade()]);assert.equal(bought.ok,true);const id=bought.results[0].id;
  assert.equal(r.transact([{process:'corregir',table:'tOperaciones',key:{ID:id},changes:{Precio:4}}]).ok,true);assert.equal(r.state().tables.tMovimientos[0].Importe,8.1);
  assert.equal(r.transact([{process:'eliminar',table:'tOperaciones',key:{ID:id}}]).ok,true);assert.equal(r.state().tables.tOperaciones.length,0);assert.equal(r.state().tables.tMovimientos.length,0);assert.ok(r.state().technical.audit.length>=6);
});
test('nómina conserva deducciones desconocidas y valida un desglose completo contra su ingreso',()=>{
  const r=runtime();r.init();assert.equal(r.transact([payroll()]).ok,true);const n=r.state().tables.tNominas[0];assert.equal(n.Bruto,null);assert.equal(n.IRPF,null);
  assert.equal(r.transact([payroll({gross:110,contribution:5,tax:5,otherDeductions:0})]).ok,true);
  const count=r.state().tables.tMovimientos.length;assert.equal(r.transact([payroll({gross:110,contribution:0,tax:0,otherDeductions:0})]).error,'INVALID_DATA');assert.equal(r.state().tables.tMovimientos.length,count);
});
test('deudas y gastos compartidos usan referencias automáticas y rechazan devoluciones excesivas',()=>{
  const r=runtime();r.init();assert.equal(r.transact([{process:'deuda_inicial',creditor:'Persona ficticia',opening:20,alias:'deuda'},{process:'pago_deuda',date:'2026-01-02',concept:'Prueba',account:'Cuenta A',debt:'$deuda',amount:5},expense({recoverable:5,alias:'gasto'}),{process:'cobro_compartido',date:'2026-01-02',concept:'Prueba',account:'Cuenta A',original:'$gasto',amount:5}]).ok,true);
  assert.equal(r.transact([{process:'pago_deuda',date:'2026-01-02',concept:'Prueba',account:'Cuenta A',debt:'Persona ficticia',amount:16}]).error,'INVALID_DATA');
  const gasto=r.state().tables.tMovimientos.find(m=>m.Tipo==='Gasto');assert.equal(r.transact([{process:'cobro_compartido',date:'2026-01-02',concept:'Prueba',account:'Cuenta A',original:gasto.ID,amount:.01}]).error,'INVALID_DATA');
});
test('observaciones guardan historial y solo comparan cortes de cierre diario confirmados',()=>{
  const r=runtime();r.init();r.transact([expense()]);
  assert.equal(r.transact([{process:'saldo_observado',account:'Cuenta A',date:'2026-01-02',amount:988,time:'10:00',scope:'intradía'}]).ok,true);
  let data=r.api({action:'read'});assert.equal(data.observations.at(-1).difference,null);
  assert.equal(r.transact([{process:'saldo_observado',account:'Cuenta A',date:'2026-01-02',amount:988,scope:'cierre_dia'}]).ok,true);
  data=r.api({action:'read'});assert.equal(data.observations.length,3);assert.equal(data.observations.at(-1).difference,0);assert.equal(data.observations.at(-1).comparisonStatus,'coincide_al_corte');
});
test('no se escriben columnas calculadas, IDs manuales ni fechas inexistentes; textos con = siguen siendo texto',()=>{
  const r=runtime();r.init();for(const data of [expense({id:'MANUAL'}),expense({date:'2026-02-30'}),expense({amount:'12'}),expense({amount:12.001})])assert.equal(r.transact([data]).error,'INVALID_DATA');
  const result=r.transact([expense({concept:'=NO_ES_UNA_FORMULA()'})]);assert.equal(result.ok,true);const id=result.results[0].id;
  assert.equal(r.transact([{process:'corregir',table:'tProductos',key:{ID:'PRODUCT-A'},changes:{Valor:20}}]).error,'INVALID_DATA');assert.equal(r.transact([{process:'corregir',table:'tMovimientos',key:{ID:id},changes:{ID:'CAMBIO'}}]).error,'INVALID_DATA');
  assert.equal(r.state().tables.tMovimientos[0].Concepto,'=NO_ES_UNA_FORMULA()');
});
test('capacidad agotada se rechaza sin escribir fuera de las fórmulas preparadas ni registrar la solicitud',()=>{
  const r=runtime();r.init();assert.equal(r.transact(Array.from({length:20},()=>expense())).ok,true);
  const count=r.writes.length;assert.equal(r.transact([expense()]).error,'CAPACITY_REACHED');assert.equal(r.writes.length,count);assert.equal(r.state().tables.tMovimientos.length,20);assert.equal(r.state().technical.requests.length,1);
});
test('objetivos y asignaciones no producen efectivo; anulación no deja asignaciones huérfanas',()=>{
  const r=runtime();r.init();const result=r.transact([{process:'objetivo',name:'Meta ficticia',amount:100,alias:'meta'},{process:'asignacion',goal:'$meta',origin:'Cuenta A',amount:25}]);assert.equal(result.ok,true);assert.equal(r.state().tables.tMovimientos.length,0);
  assert.equal(r.transact([{process:'eliminar',table:'tObjetivos',key:{ID:result.results[0].id}}]).ok,true);assert.equal(r.state().tables.tAsignaciones.length,0);
});
test('prueba del editor comprueba altas, reintentos, corrección y anulación, restaurando las entradas',()=>{
  const r=runtime();const result=JSON.parse(JSON.stringify(r.ctx.probarTransaccionesPaso3()));assert.equal(result.ok,true);assert.equal(result.financialInputsRestored,true);assert.equal(result.duplicatePrevented,true);assert.equal(r.state().tables.tMovimientos.length,0);
});
test('reutilizar un hueco de una anulación devuelve una revisión válida para la siguiente operación',()=>{
  const r=runtime();r.init();const first=r.transact([expense(),expense(),expense()]);assert.equal(first.ok,true);
  assert.equal(r.transact([{process:'eliminar',table:'tMovimientos',key:{ID:first.results[1].id}}]).ok,true);
  const inserted=r.transact([expense()]);assert.equal(inserted.ok,true);assert.equal(inserted.revision,r.state().revision);
  assert.equal(r.api({action:'transact',requestId:crypto.randomUUID(),expectedRevision:inserted.revision,operations:[expense()]}).ok,true);
});
