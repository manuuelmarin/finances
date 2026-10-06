const {test}=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto');
const {runtime,serial}=require('./helpers/runtime.cjs');
const ISIN='ES0112611001', SECOND='IE00BYX5NK04', TITLE='AZVALOR INTERNACIONAL, FI';
const url=isin=>'https://www.quefondos.com/es/fondos/ficha/index.html?isin='+isin;
// Fichas mínimas sintéticas: no se redistribuye el HTML del proveedor.
function page({isin=ISIN,name=TITLE,price='345,197060',currency='EUR',quoteCurrency='EUR',date='02/10/2026',headerIsin=isin}={}) {
  return `<h1>${name} (${headerIsin}) · Gestora</h1><h4>Rentabilidad</h4><p>Fecha: 01/09/2026</p><h4>Caracter&iacute;sticas</h4><p><span>ISIN: </span><span>${isin}</span></p><p>Divisa: <span>${currency}</span></p><h4>&Uacute;ltima valoraci&oacute;n</h4><p>Valor liquidativo: <span>${price} ${quoteCurrency}</span></p><p>Fecha: <span>${date}</span></p><h4>Hist&oacute;rico</h4><p>Fecha: 01/10/2026</p>`;
}
function configured(options={}) {
  const r=runtime({fetch:()=>({body:page()}),...options});assert.equal(r.init().ok,true);
  assert.equal(r.transact([{process:'vincular_isin',product:'Fondo A',isin:ISIN,referenceName:TITLE}]).ok,true);assert.equal(r.transact([{process:'fechas',asof:'2026-10-06',valuation:'2026-10-06'}]).ok,true);assert.equal(r.init().ok,true);return r;
}
const envelope=r=>({action:'refreshPrices',requestId:crypto.randomUUID(),expectedRevision:r.state().revision});
const quote=(r,isin=ISIN,referenceName=TITLE)=>r.api({action:'quotePrices',funds:[{isin,referenceName}]}).results[0];

test('consulta genérica de un fondo fuera de la cartera conserva seis decimales, fecha VL y moneda',()=>{
  const r=runtime({fetch:()=>({body:page()})}), result=quote(r);assert.equal(result.ok,true);assert.equal(result.price,345.19706);assert.equal(result.date,'2026-10-02');assert.equal(result.classCurrency,'EUR');assert.equal(result.quoteCurrency,'EUR');assert.equal(result.originalClassPrice,null);assert.equal(r.writes.length,0);assert.equal(r.fetches[0].url,url(ISIN));
});
test('clase USD conserva la cotización EUR publicada y documenta la conversión del proveedor',()=>{
  const r=runtime({fetch:()=>({body:page({isin:SECOND,name:'FIDELITY MSCI WORLD INDEX FUND P-ACC-USD',currency:'USD',price:'11,864855'})})});
  const result=quote(r,SECOND,'Fidelity MSCI World P Acc USD');assert.equal(result.ok,true);assert.equal(result.price,11.864855);assert.equal(result.classCurrency,'USD');assert.equal(result.quoteCurrency,'EUR');assert.equal(result.conversion,'provider_eur');assert.equal(result.originalClassPrice,null);
});
test('comprueba ISIN y dígito de control antes de acceder a la red; admite minúsculas y espacios exteriores',()=>{
  const r=runtime({fetch:()=>({body:page()})});assert.equal(quote(r,'ES0112611002').error,'INVALID_ISIN');assert.equal(r.fetches.length,0);assert.equal(quote(r,' es0112611001 ').ok,true);assert.equal(r.fetches.length,1);
});
test('página de otra clase, cabecera equivocada o ficha vacía no pueden actualizar el fondo',()=>{
  for(const body of [page({isin:SECOND}),page({headerIsin:SECOND}),'<h1>No disponible</h1>']){const r=runtime({fetch:()=>({body})});assert.equal(quote(r).ok,false);assert.equal(r.writes.length,0);}
});
test('rechaza nombre ajeno, moneda y clase incoherentes, incluso al reutilizar la caché por ISIN',()=>{
  const r=runtime({fetch:()=>({body:page({isin:SECOND,name:'FIDELITY MSCI WORLD INDEX FUND P-ACC-USD',currency:'USD'})})});
  assert.equal(quote(r,SECOND,'Fidelity MSCI World P Acc USD').ok,true);
  for(const name of ['Azvalor Internacional','Fidelity World P Acc EUR','Fidelity World I Acc USD','Fidelity World P Dist USD'])assert.equal(quote(r,SECOND,name).error,'NAME_MISMATCH');
  assert.equal(r.fetches.length,1);
});
test('elige el bloque última valoración y no fechas de rentabilidad, publicidad o históricos',()=>{
  const r=runtime({fetch:()=>({body:page()})});assert.equal(quote(r).date,'2026-10-02');
  const changed=runtime({fetch:()=>({body:page().replace('&Uacute;ltima valoraci&oacute;n','Otra sección')})});assert.equal(quote(changed).error,'SOURCE_FORMAT');
});
test('rechaza fecha inexistente, futura, cero, formatos ambiguos y cotización sin EUR',()=>{
  for(const [data,code] of [[{date:'30/02/2026'},'INVALID_DATE'],[{date:'01/01/2099'},'FUTURE_DATE'],[{price:'0,000000'},'INVALID_PRICE'],[{price:'345.197060'},'INVALID_PRICE'],[{quoteCurrency:'USD'},'UNSUPPORTED_CURRENCY']]) {
    const r=runtime({fetch:()=>({body:page(data)})});assert.equal(quote(r).error,code);
  }
  const r=runtime({fetch:()=>({body:page({price:'1.345,197060'})})});assert.equal(quote(r).price,1345.19706);
});
test('fallos HTTP, red y formato son resultados por fondo, no precios cero ni excepciones privadas',()=>{
  for(const fetch of [()=>({status:429,body:''}),()=>{throw Error('private-secret');},()=>({body:'<h1>Rediseño</h1>'})]){const r=runtime({fetch});const result=quote(r);assert.equal(result.ok,false);assert.equal(result.price,undefined);assert.equal(JSON.stringify(result).includes('private-secret'),false);}
});
test('fecha antigua queda visible y no se convierte en fecha de consulta',()=>{
  const r=runtime({fetch:()=>({body:page({date:'01/09/2026'})})});const result=quote(r);assert.equal(result.ok,true);assert.equal(result.date,'2026-09-01');assert.equal(result.warning,'PUBLICATION_DELAY');assert.ok(result.ageDays>4);assert.notEqual(result.date,result.checkedAt.slice(0,10));
});
test('consulta solo lectura y autorización: no permite URLs libres, sobres manuales o identidad ajena',()=>{
  const r=runtime({fetch:()=>({body:page()})});assert.equal(r.api({action:'quotePrices',funds:[{isin:ISIN,referenceName:TITLE,url:'https://arbitrary.test'}]}).error,'INVALID_REQUEST');
  assert.equal(r.api({action:'quotePrices',funds:[{isin:ISIN,referenceName:TITLE}],operations:[]}).error,'INVALID_REQUEST');assert.equal(r.fetches.length,0);
  const denied=runtime({visitor:'other@example.test'});assert.equal(denied.api({action:'quotePrices',funds:[{isin:ISIN,referenceName:TITLE}]}).error,'ACCESS_DENIED');assert.equal(denied.fetches.length,0);
});
test('alta con ISIN genera ID interno y añade registro de referencia sin modificar el fondo original',()=>{
  const r=runtime();r.init();const res=r.transact([{process:'producto',name:'Mi nuevo fondo',account:'Cuenta B',class:'Renta variable',date:'2026-01-01',isin:ISIN,referenceName:TITLE}]);assert.equal(res.ok,true);assert.match(res.results[0].id,/^PRO-/);assert.notEqual(res.results[0].id,ISIN);
  assert.equal(r.state().technical.funds[0][0],res.results[0].id);assert.equal(r.state().technical.funds[0][1],ISIN);assert.equal(r.state().tables.tProductos[0].ID,'PRODUCT-A');
  assert.equal(r.transact([{process:'vincular_isin',product:res.results[0].id,isin:SECOND,referenceName:'Fidelity MSCI World P Acc USD'}]).error,'INVALID_DATA');
});
test('actualizar el nombre de referencia conserva historial; vincular otro fondo requiere producto nuevo',()=>{
  const r=configured(), old=r.state().revision;assert.equal(r.transact([{process:'vincular_isin',product:'Fondo A',isin:ISIN,referenceName:'Azvalor Internacional'}]).ok,true);assert.equal(r.state().technical.funds.length,2);assert.notEqual(r.state().revision,old);
  assert.equal(r.transact([{process:'vincular_isin',product:'Fondo A',isin:SECOND,referenceName:'Fidelity World USD'}]).error,'INVALID_DATA');assert.equal(r.state().technical.funds.length,2);
});
test('productos históricos cuyo ID es ISIN se vinculan automáticamente sin tocar entradas',()=>{
  const r=runtime();for(const [field,value] of [['ID',ISIN],['Producto',TITLE]])r.setInput('tProductos',0,field,value);r.setInput('tPrecios',0,'Producto',ISIN);const before=JSON.stringify(r.state().tables);r.init();assert.equal(JSON.stringify(r.state().tables),before);assert.equal(r.state().technical.funds[0][1],ISIN);assert.equal(r.api({action:'diagnostics'}).priceReady,true);
});
test('actualización atómica guarda precio, consulta, auditoría y solicitud y conserva caja y participaciones',()=>{
  const r=configured(), before=r.state(), writes=r.writes.length, res=r.api(envelope(r));assert.equal(res.ok,true);assert.equal(res.complete,true);assert.equal(res.results[0].status,'updated');assert.equal(r.writes.length,writes+1);
  const s=r.state();assert.equal(s.tables.tPrecios.at(-1)['VL EUR'],345.19706);assert.equal(s.tables.tPrecios.at(-1).Fecha,serial('2026-10-02'));assert.equal(s.technical.quotes.length,1);assert.equal(s.technical.requests.length,before.technical.requests.length+1);assert.ok(s.technical.audit.some(a=>a[2]==='quotes'));assert.equal(JSON.stringify(s.tables.tProductos),JSON.stringify(before.tables.tProductos));assert.equal(JSON.stringify(s.tables.tMovimientos),JSON.stringify(before.tables.tMovimientos));assert.equal(JSON.stringify(s.tables.tOperaciones),JSON.stringify(before.tables.tOperaciones));assert.equal(res.revision,s.revision);
});
test('reintento conserva la respuesta aunque el mercado cambie y no vuelve a consultar ni duplicar',()=>{
  const r=configured(), req=envelope(r), first=r.api(req), writes=r.writes.length, calls=r.fetches.length;r.cache.clear();r.options.fetch=()=>({body:page({price:'346,000000'})});const again=r.api(req);assert.equal(again.replayed,true);assert.equal(again.results[0].price,first.results[0].price);assert.equal(r.writes.length,writes);assert.equal(r.fetches.length,calls);assert.equal(r.api({...req,products:['Fondo A']}).error,'REQUEST_CONFLICT');assert.equal(r.api({action:'requestStatus',requestId:req.requestId}).replayed,true);
});
test('nueva solicitud para el mismo precio no duplica filas y sí conserva el nuevo intento',()=>{
  const r=configured();assert.equal(r.api(envelope(r)).results[0].status,'updated');assert.equal(r.api(envelope(r)).results[0].status,'unchanged');assert.equal(r.state().tables.tPrecios.length,2);assert.equal(r.state().technical.quotes.length,2);
});
test('precio distinto en la misma fecha requiere revisión y nunca sustituye el guardado',()=>{
  const r=configured();r.setInput('tPrecios',0,'Fecha',serial('2026-10-02'));r.setInput('tPrecios',0,'VL EUR',344);const res=r.api(envelope(r));assert.equal(res.complete,false);assert.equal(res.results[0].status,'needs_review');assert.equal(res.results[0].error,'PRICE_CONFLICT');assert.equal(r.state().tables.tPrecios.length,1);assert.equal(r.state().tables.tPrecios[0]['VL EUR'],344);
});
test('una cotización anterior a la última guardada no hace retroceder el valor ni los cortes',()=>{
  const r=configured();r.setInput('tPrecios',0,'Fecha',serial('2026-10-05'));const cuts=JSON.stringify(r.state().settings), res=r.api(envelope(r));assert.equal(res.results[0].status,'older');assert.equal(r.state().tables.tPrecios.length,1);assert.equal(JSON.stringify(r.state().settings),cuts);
});
test('fallo parcial conserva el precio del fondo sin fuente y actualiza el fondo verificable',()=>{
  const r=configured();const added=r.transact([{process:'producto',name:'Fondo nuevo',account:'Cuenta B',class:'Renta variable',date:'2026-01-01',isin:SECOND,referenceName:'Fidelity MSCI World P Acc USD'}]);assert.equal(added.ok,true);
  r.options.fetch=address=>address===url(ISIN)?{body:page()}:{status:503,body:''};const res=r.api(envelope(r));assert.equal(res.ok,true);assert.equal(res.complete,false);assert.equal(res.counts.updated,1);assert.equal(res.counts.failed,1);assert.equal(r.state().technical.quotes.length,2);assert.equal(r.state().tables.tPrecios.length,2);
});
test('producto sin ISIN informa el dato pendiente sin consulta a la red ni cambios financieros',()=>{
  const r=runtime();r.init();const before=JSON.stringify({tables:r.state().tables,settings:r.state().settings});const res=r.api(envelope(r));assert.equal(res.results[0].error,'ISIN_REQUIRED');assert.equal(res.complete,false);assert.equal(r.fetches.length,0);assert.equal(JSON.stringify({tables:r.state().tables,settings:r.state().settings}),before);
});
test('edición concurrente durante la red rechaza el lote completo antes de guardar precios o consultas',()=>{
  const r=configured();r.options.fetch=()=>{r.setInput('tCuentas',0,'Saldo inicial',1001);return {body:page()};};const req=envelope(r), count=r.writes.length;assert.equal(r.api(req).error,'CONFLICT');assert.equal(r.writes.length,count);assert.equal(r.state().technical.quotes.length,0);assert.equal(r.state().tables.tPrecios.length,1);
});
test('respuesta perdida del lote se recupera y fallo previo puede reintentarse sin duplicados',()=>{
  const r=configured();r.options.loseResponseOnce=true;const req=envelope(r);assert.equal(r.api(req).replayed,true);assert.equal(r.state().technical.quotes.length,1);
  const other=configured(), next=envelope(other);other.options.failBeforeWrite=true;assert.equal(other.api(next).error,'WRITE_UNCERTAIN');assert.equal(other.state().tables.tPrecios.length,1);assert.equal(other.state().technical.quotes.length,0);other.options.failBeforeWrite=false;assert.equal(other.api(next).ok,true);assert.equal(other.state().technical.quotes.length,1);
});
test('selección acotada y distinta: no admite más de veinte fondos, duplicados ni campos de servidor',()=>{
  const r=configured();assert.equal(r.api({...envelope(r),products:['Fondo A','PRODUCT-A']}).error,'INVALID_REQUEST');assert.equal(r.api({...envelope(r),products:Array(21).fill('Fondo A')}).error,'INVALID_REQUEST');assert.equal(r.api({...envelope(r),operations:[{process:'precio'}]}).error,'INVALID_REQUEST');assert.equal(r.api({action:'quotePrices',funds:Array(21).fill({isin:ISIN,referenceName:TITLE})}).error,'INVALID_REQUEST');assert.equal(r.fetches.length,0);
});
test('lectura expone fecha del último VL y estado del último intento; comprobar y probar no guardan VL',()=>{
  const r=configured(), prices=JSON.stringify(r.state().tables.tPrecios);assert.equal(r.ctx.comprobarPaso4().priceReady,true);assert.equal(r.ctx.probarFuentesPaso4().complete,true);assert.equal(JSON.stringify(r.state().tables.tPrecios),prices);
  r.api(envelope(r));const snapshot=r.api({action:'read'}).prices[0];assert.equal(snapshot.isin,ISIN);assert.equal(snapshot.lastValid.date,'2026-10-02');assert.equal(snapshot.lastAttempt.status,'updated');assert.equal(r.ctx.actualizarPreciosPaso4().complete,true);assert.equal(r.state().tables.tPrecios.length,2);
});
test('parser genérico funciona con otros ISIN válidos sin catálogo o identificadores hardcodeados',()=>{
  const ids=['IE00BYX5NX33','ES0175902008','IE0031786696','ES0112611001','IE00BYX5NK04'];
  const r=runtime({fetch:address=>({body:page({isin:new URL(address).searchParams.get('isin'),name:'Fondo Prueba Genérico'})})});
  const result=r.api({action:'quotePrices',funds:ids.map(isin=>({isin,referenceName:'Prueba Genérico'}))});assert.equal(result.complete,true);assert.equal(r.fetches.length,5);assert.equal(r.writes.length,0);
});
test('migración desde tres hojas técnicas añade solo fondos y cotizaciones y conserva solicitudes anteriores',()=>{
  const r=runtime();r.init();r.transact([{process:'gasto',date:'2026-01-02',concept:'Prueba',account:'Cuenta A',category:'Café',amount:1}]);const before=r.state();
  r.removeTechnical('_Finanzas_Fondos');r.removeTechnical('_Finanzas_Cotizaciones');assert.equal(r.api({action:'diagnostics'}).backendReady,true);assert.equal(r.api({action:'diagnostics'}).priceReady,false);
  assert.equal(r.ctx.comprobarPaso4().priceReady,true);assert.equal(JSON.stringify(r.state().tables),JSON.stringify(before.tables));assert.equal(JSON.stringify(r.state().technical.requests),JSON.stringify(before.technical.requests));assert.equal(r.book().sheets.length,15);
});
test('ampliación de precios con tabla llena conserva los precios históricos y guarda el nuevo una sola vez',()=>{
  const r=configured(), cap=r.state().raw.tPrecios.length;
  for(let i=0;i<cap;i++)for(const [field,value] of Object.entries({Producto:'PRODUCT-A',Fecha:serial('2025-01-01')+i,'VL EUR':3,Fuente:'Fuente ficticia'}))r.setInput('tPrecios',i,field,value);
  const req=envelope(r), response=r.api(req);assert.equal(response.ok,true);assert.equal(response.results[0].status,'updated');assert.equal(r.api(req).replayed,true);assert.equal(r.state().tables.tPrecios.length,cap+1);assert.ok(r.state().raw.tPrecios.length>cap);assert.equal(r.state().tables.tPrecios.filter(p=>p['VL EUR']===345.19706).length,1);
});
