const {test}=require('node:test'), assert=require('node:assert/strict');
const {acceptsApiMessage}=require('../web/api.js');
const popup={}, session={popup,state:'session-nonce'}, callId='call-nonce';
const good=()=>({origin:'https://example-script.googleusercontent.com',source:{top:popup},data:{type:'finances.api.response.v1',state:session.state,callId,result:{ok:true}}});
test('canal API acepta solo Google, la ventana iniciada y referencias correspondientes',()=>{
  assert.equal(acceptsApiMessage(good(),session,callId),true);
  for(const changed of [{origin:'https://example.com'},{origin:'https://script.googleusercontent.com.example.com'},{source:{top:{}}},{source:null},{data:{...good().data,state:'another'}},{data:{...good().data,callId:'another'}},{data:{...good().data,type:'finances.connection.v1'}},{data:{...good().data,result:{ok:'true'}}}])assert.equal(acceptsApiMessage({...good(),...changed},session,callId),false);
  assert.equal(acceptsApiMessage(good(),null,callId),false);
});
test('Bridge valida origen, ventana, sesión y llamada antes de ejecutar la función autenticada de Google',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../apps-script/Bridge.html'),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const calls=[],messages=[],opener={postMessage:(v,origin)=>messages.push({v,origin})};let listener;
  const payload={ok:true,environment:'test',modelVersion:3,sheetCount:10,state:'session-nonce'};
  const runner={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){return this;},financialApi(request){calls.push(request);this.success({ok:true});}};
  const elements={payload:{textContent:JSON.stringify(payload)},origin:{textContent:'https://manuuelmarin.github.io'},status:{},detail:{}};
  vm.runInNewContext(script,{window:{top:{opener},addEventListener:(type,fn)=>listener=fn},document:{getElementById:id=>elements[id]},google:{script:{run:runner}}});
  const valid={origin:'https://manuuelmarin.github.io',source:opener,data:{type:'finances.api.request.v1',state:'session-nonce',callId:'68c0eea1-d067-4af1-a61d-e5b27aacb0b9',request:{action:'read'}}};
  for(const changed of [{origin:'https://example.com'},{source:{}},{data:{...valid.data,state:'another'}},{data:{...valid.data,callId:'invalid'}},{data:{...valid.data,type:'other'}}])listener({...valid,...changed});
  assert.equal(calls.length,0);listener(valid);assert.equal(calls.length,1);assert.equal(messages.at(-1).v.type,'finances.api.response.v1');assert.equal(messages.at(-1).origin,'https://manuuelmarin.github.io');
});
