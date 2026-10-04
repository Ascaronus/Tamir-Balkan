const {test}=require('node:test')
const assert=require('node:assert/strict')
require('ts-node/register/transpile-only')
const {googleTranslate}=require('../src/utils/google-translate')
const {POST}=require('../src/api/admin/products/[id]/option-translations/translate/route')
const {POST:translateProduct}=require('../src/api/admin/rozetka/translate/route')
function response(){return {statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}}
const req=cells=>({auth_context:{actor_id:'admin',actor_type:'user'},params:{id:'p1'},body:{cells},scope:{resolve:()=>({retrieveProduct:async()=>({options:[{id:'color',title:'Color',values:[{id:'gray',value:'Gray'}]},{id:'size',title:'Size',values:[{id:'xl',value:'XL'},{id:'42',value:'42'}]}]})})}})
async function provider(run){const oldFetch=global.fetch,oldKey=process.env.GOOGLE_TRANSLATE_API_KEY;process.env.GOOGLE_TRANSLATE_API_KEY='test-only';const calls=[]
 global.fetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push(body);assert.equal(init.headers['X-Goog-Api-Key'],'test-only');assert.ok(!url.includes('test-only'));return new Response(JSON.stringify({data:{translations:body.q.map(q=>({translatedText:body.target==='sr'?({Color:'Боја',Gray:'Сива',Size:'Величина'}[q]||q):q}))}}))}
 try{await run(calls)}finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.GOOGLE_TRANSLATE_API_KEY;else process.env.GOOGLE_TRANSLATE_API_KEY=oldKey}}
test('option preview uses server originals and Serbian Latin, preserves size codes and never writes translations',()=>provider(async calls=>{
 const res=response();await POST(req([{id:'color',locale:'sr-RS'},{id:'gray',locale:'sr-RS'},{id:'gray',locale:'en'},{id:'xl',locale:'sr-RS'},{id:'42',locale:'en'}]),res)
 assert.equal(res.statusCode,200);assert.deepEqual(res.body.values,{'color:sr-RS':'Boja','gray:sr-RS':'Siva','xl:sr-RS':'XL','gray:en':'Gray','42:en':'42'})
 assert.equal(calls.length,2);assert.ok(calls.every(call=>!call.q.includes('XL')&&!call.q.includes('42')))
}))
test('foreign option IDs, non-admins and invalid locales fail before billed requests',()=>provider(async calls=>{
 for(const [request,status] of [[req([{id:'foreign',locale:'sr-RS'}]),409],[{...req([{id:'gray',locale:'en'}]),auth_context:{actor_id:'customer',actor_type:'customer'}},401],[req([{id:'gray',locale:'ru'}]),400]]){
  const res=response();await POST(request,res);assert.equal(res.statusCode,status)
 }
 assert.equal(calls.length,0)
}))
test('missing configuration and provider failure return clear errors without partial values',()=>provider(async()=>{
 delete process.env.GOOGLE_TRANSLATE_API_KEY
 let res=response();await POST(req([{id:'gray',locale:'en'}]),res);assert.equal(res.statusCode,503)
 process.env.GOOGLE_TRANSLATE_API_KEY='test-only';global.fetch=async()=>new Response('{}',{status:429})
 res=response();await POST(req([{id:'gray',locale:'en'}]),res);assert.equal(res.statusCode,502);assert.equal(res.body.values,undefined)
}))
test('shared translation deduplicates and batches without changing output order',()=>provider(async calls=>{
 const texts=Array.from({length:51},(_,i)=>'Text '+i);texts.push('Text 0','')
 const result=await googleTranslate(texts,'en');assert.deepEqual(result,texts);assert.equal(calls.length,2);assert.equal(calls[0].q.length,50)
}))
test('Rozetka title/description response remains compatible with empty descriptions',()=>provider(async()=>{
 const request={...req([]),body:{title:'Gray',description:''}},res=response()
 await translateProduct(request,res);assert.equal(res.statusCode,200)
 assert.deepEqual(res.body,{title_sr:'Siva',description_sr:'',title_en:'Gray',description_en:''})
}))
