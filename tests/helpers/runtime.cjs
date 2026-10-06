// Servicio de Sheets simulado con datos ficticios; ninguna credencial o dato personal.
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), crypto=require('node:crypto');
const serial=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);
const clone=value=>JSON.parse(JSON.stringify(value));
function runtime(options={}) {
  let book={sheets:[]}, grid=new Map(), busy=false;
  const writes=[], logs=[];
  const ctx=vm.createContext({console:{log:text=>logs.push(text)},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algo,value)=>[...crypto.createHash(algo).update(value).digest()].map(b=>b>127?b-256:b)},
    PropertiesService:{getScriptProperties:()=>({getProperty:name=>({TEST_SPREADSHEET_ID:'fixture-book',OWNER_EMAIL:'owner@example.test',ENVIRONMENT:'test',...options.properties})[name]})},
    Session:{getActiveUser:()=>({getEmail:()=>options.visitor===undefined?'owner@example.test':options.visitor})},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(options.busy||busy)return false;busy=true;return true;},releaseLock:()=>{busy=false;}})},
    Sheets:{Spreadsheets:{get:()=>clone(book),Values:{batchGet:(id,request)=>({valueRanges:request.ranges.map(range=>({values:values(range)}))})},batchUpdate:(body,id)=>{
      if(id!=='fixture-book') throw Error('Wrong fixture id');
      writes.push(clone(body));if(options.failBeforeWrite) throw Error('Transport failure before application');
      const nextBook=clone(book), nextGrid=new Map(grid);
      body.requests.forEach(request=>{
        if(request.addSheet) nextBook.sheets.push({properties:clone(request.addSheet.properties),tables:[]});
        else if(request.appendDimension) {
          const req=request.appendDimension, sheet=nextBook.sheets.find(s=>s.properties.sheetId===req.sheetId);sheet.properties.gridProperties.rowCount+=req.length;
        } else if(request.updateCells) {
          const {start,rows}=request.updateCells, sheet=nextBook.sheets.find(s=>s.properties.sheetId===start.sheetId);
          if(!sheet||start.rowIndex+rows.length>sheet.properties.gridProperties.rowCount) throw Error('Invalid grid write');
          rows.forEach((row,ri)=>row.values.forEach((cell,ci)=>{
            if(start.columnIndex+ci>=sheet.properties.gridProperties.columnCount)throw Error('Invalid column');
            nextGrid.set([start.sheetId,start.rowIndex+ri,start.columnIndex+ci].join(':'),clone(cell));
          }));
        } else if(request.findReplace) {
          const r=request.findReplace;
          for(let row=r.range.startRowIndex;row<r.range.endRowIndex;row++) for(let col=r.range.startColumnIndex;col<r.range.endColumnIndex;col++){
            const key=[r.range.sheetId,row,col].join(':'),cell=nextGrid.get(key);
            if(cell&&cell.userEnteredValue&&cell.userEnteredValue.stringValue===r.find) nextGrid.set(key,{userEnteredValue:{stringValue:r.replacement}});
          }
        } else throw Error('Unknown fixture request');
      });
      book=nextBook;grid=nextGrid;
      if(options.loseResponseOnce){options.loseResponseOnce=false;throw Error('Response lost after commit');}
      return {replies:body.requests.map(()=>({}))};
    }}}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../../apps-script/Code.gs'),'utf8'),ctx);
  const schemas=JSON.parse(vm.runInContext('JSON.stringify(TABLE_SCHEMA_)',ctx));
  const inputSchema=JSON.parse(vm.runInContext('JSON.stringify(INPUT_SCHEMA_)',ctx));
  const positions={tMovimientos:[7,1,28],tProductos:[28,1,49],tOperaciones:[54,1,85],tPrecios:[90,1,121],tCuentas:[7,1,28],tDeudas:[7,7,28],tVinculos:[33,1,54],tNominas:[7,1,28],tObjetivos:[7,1,13],tAsignaciones:[18,1,29],tParametros:[4,1,10],tCategorias:[13,1,34]};
  const titles=JSON.parse(vm.runInContext('JSON.stringify(REQUIRED_SHEETS_)',ctx));
  book.sheets=titles.map((title,sheetId)=>({properties:{title,sheetId,gridProperties:{rowCount:1000,columnCount:26}},tables:schemas.filter(s=>s[0]===title).map(([,name,headers])=>{
    const [startRowIndex,startColumnIndex,endRowIndex]=positions[name];
    return {name,range:{sheetId,startRowIndex,startColumnIndex,endRowIndex,endColumnIndex:startColumnIndex+headers.length},columnProperties:headers.map((columnName,columnIndex)=>({columnName,columnIndex}))};
  })}));
  function setValue(sheetId,row,column,value){grid.set([sheetId,row,column].join(':'),{userEnteredValue:typeof value==='number'?{numberValue:value}:value===null?{}:{stringValue:value}});}
  schemas.forEach(([title,name,headers])=>{
    const sheet=book.sheets.find(s=>s.properties.title===title), table=sheet.tables.find(t=>t.name===name), range=table.range;
    headers.forEach((h,i)=>setValue(range.sheetId,range.startRowIndex,range.startColumnIndex+i,h));
    if(inputSchema[name]) for(let row=range.startRowIndex+1;row<range.endRowIndex;row++) headers.forEach((h,i)=>{
      if(!inputSchema[name].inputs.includes(h)) grid.set([range.sheetId,row,range.startColumnIndex+i].join(':'),{userEnteredValue:{formulaValue:'=FIXTURE_FORMULA('+row+')'},effectiveValue:{numberValue:0}});
    });
  });
  const data={
    tCuentas:[{Cuenta:'Cuenta A','Saldo inicial':1000,'Saldo real':1000,'Fecha saldo':serial('2026-01-01')},{Cuenta:'Cuenta B','Saldo inicial':0,'Saldo real':null,'Fecha saldo':null}],
    tCategorias:[{Grupo:'Gastos',Subgrupo:'Hogar',Categoría:'Alimentación',Subcategoría:'Café'},{Grupo:'Ingresos',Subgrupo:'Trabajo',Categoría:'Ingresos',Subcategoría:'Nómina'}],
    tProductos:[{ID:'PRODUCT-A',Producto:'Fondo A',Cuenta:'Cuenta A',Clase:'Renta variable','Fecha base':serial('2025-01-01'),'Unidades base':5,'Coste base':10}],
    tPrecios:[{Producto:'PRODUCT-A',Fecha:serial('2026-01-01'),'VL EUR':3,Fuente:'Fuente ficticia'}],
    tParametros:[{'Parámetro':'Inicio seguimiento',Valor:serial('2026-01-01')},{'Parámetro':'Fecha informe',Valor:serial('2026-01-02')},{'Parámetro':'Valoración inversiones',Valor:serial('2026-01-01')},{'Parámetro':'Moneda',Valor:'EUR'},{'Parámetro':'Versión modelo',Valor:3}],
    ...options.data
  };
  Object.entries(data).forEach(([name,rows])=>{
    const spec=schemas.find(s=>s[1]===name), sheet=book.sheets.find(s=>s.properties.title===spec[0]), range=sheet.tables.find(t=>t.name===name).range;
    rows.forEach((r,i)=>spec[2].forEach((h,j)=>{if(Object.prototype.hasOwnProperty.call(r,h))setValue(range.sheetId,range.startRowIndex+1+i,range.startColumnIndex+j,r[h]);}));
  });
  function col(s){let n=0;for(const c of s)n=n*26+c.charCodeAt(0)-64;return n-1;}
  function values(range){
    const m=range.match(/^'((?:[^']|'')+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/);if(!m)throw Error('Unsupported fixture A1 '+range);
    const sheet=book.sheets.find(s=>s.properties.title===m[1].replace(/''/g,"'"));if(!sheet)throw Error('Sheet missing');
    const rows=[];
    for(let row=Number(m[3])-1;row<Number(m[5]);row++){
      const cells=[];for(let c=col(m[2]);c<=col(m[4]);c++){
        const cell=grid.get([sheet.properties.sheetId,row,c].join(':'))||{}, v=cell.effectiveValue||cell.userEnteredValue||{};
        cells.push(v.numberValue===undefined?(v.stringValue===undefined?'':v.stringValue):v.numberValue);
      }
      while(cells.length&&cells.at(-1)==='')cells.pop();rows.push(cells);
    }
    while(rows.length&&!rows.at(-1).length)rows.pop();return rows;
  }
  return {ctx,writes,logs,options,schemas,inputSchema,
    state:()=>ctx.readState_({id:'fixture-book'}),
    init:()=>JSON.parse(JSON.stringify(ctx.comprobarPaso3())),
    api:request=>JSON.parse(JSON.stringify(ctx.financialApi(request))),
    transact:operations=>JSON.parse(JSON.stringify(ctx.financialApi({action:'transact',requestId:crypto.randomUUID(),expectedRevision:ctx.readState_({id:'fixture-book'}).revision,operations}))),
    formulas:()=>[...grid].filter(([,cell])=>cell.userEnteredValue&&cell.userEnteredValue.formulaValue).map(([key,cell])=>[key,cell.userEnteredValue.formulaValue]),
    setInput:(name,index,field,value)=>{const spec=schemas.find(s=>s[1]===name), sheet=book.sheets.find(s=>s.properties.title===spec[0]), r=sheet.tables.find(t=>t.name===name).range;setValue(r.sheetId,r.startRowIndex+1+index,r.startColumnIndex+spec[2].indexOf(field),value);},
    book:()=>clone(book)
  };
}
module.exports={runtime,serial,clone};
