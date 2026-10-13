const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { ContainerRegistrationKeys, Modules } = require('@medusajs/framework/utils')
const { productUrlSchema, syncProductUrl, englishProductText } = require('../src/utils/product-urls')
const { GET: resolveProductUrl } = require('../src/api/store/product-redirects/[handle]/route')
const connection = process.env.TEST_REVIEWS_DB_URL
if (!connection) throw Error('Set TEST_REVIEWS_DB_URL to an isolated test database')
const knex = require('knex'), schema = 'tamir_url_test_' + process.pid
const root = knex({ client:'pg', connection })
const db = knex({ client:'pg', connection, searchPath:[schema] })
const translations = new Map()
const container = {resolve(key) {
 if(key===ContainerRegistrationKeys.PG_CONNECTION)return db
 if(key===Modules.TRANSLATION)return {listTranslations:async({reference_id})=>translations.has(reference_id)?[{translations:translations.get(reference_id)}]:[]}
 throw Error('Unknown dependency '+key)
}}
before(async()=>{
 await root.raw(`CREATE SCHEMA ${schema}`)
 await db.schema.createTable('product', t=>{t.text('id').primary();t.text('handle');t.text('status').defaultTo('published');t.jsonb('metadata');t.timestamp('deleted_at').nullable()})
 await db.raw(productUrlSchema)
 await db.raw(productUrlSchema)
 for(const id of ['a','b','c','missing'])await db('product').insert({id,handle:'sr-'+id,metadata:{manual:'keep',stock_test:7}})
 for(const id of ['a','b','c'])translations.set(id,{title:'Burgundy winter hat',description:'Warm acrylic hat.'})
})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
test('parallel imports reserve unique English URLs and reimport/title changes never rename them',async()=>{
 const results=await Promise.all(['a','b','c'].map(id=>syncProductUrl(container,id)))
 assert.equal(new Set(results.map(r=>r.handle)).size,3)
 const original=results[0].handle
 translations.set('a',{title:'Edited English name',description:'Reviewed description'})
 assert.equal((await syncProductUrl(container,'a')).handle,original)
 const product=await db('product').where({id:'a'}).first()
 assert.equal(product.handle,'sr-a');assert.equal(product.metadata.manual,'keep');assert.equal(product.metadata.stock_test,7);assert.equal(product.metadata.en_content_ready,true)
})
test('manual rename keeps aliases, prevents hijacking/reuse, and allows restoring own old address',async()=>{
 const old=(await syncProductUrl(container,'a')).handle
 await syncProductUrl(container,'a','reviewed-english-hat')
 assert.equal((await db('tamir_product_url').where({handle:old}).first()).product_id,'a')
 assert.equal((await db('tamir_product_url').where({handle:old}).first()).is_current,false)
 await assert.rejects(syncProductUrl(container,'b',old),/уже используется/)
 await assert.rejects(syncProductUrl(container,'b','sr-c'),/уже используется/)
 await assert.rejects(syncProductUrl(container,'b','../bad?slug'),/латинские/)
 await syncProductUrl(container,'a',old)
 assert.equal((await db('tamir_product_url').where({product_id:'a',is_current:true})).length,1)
})
test('missing translations do not acquire a misleading URL and deleted EN content becomes unready',async()=>{
 assert.deepEqual(await syncProductUrl(container,'missing'),{handle:'',ready:false,title:''})
 translations.set('missing',{title:'Шапка',description:'Описание'})
 assert.equal((await syncProductUrl(container,'missing')).ready,false)
 assert.equal(englishProductText({title:'Hat',description:''}).ready,false)
 const old=(await syncProductUrl(container,'a')).handle
 translations.delete('a')
 const result=await syncProductUrl(container,'a');assert.equal(result.ready,false);assert.equal(result.handle,old)
})

async function resolve(handle) {
 const result = {status:200,headers:{}}
 const res = {
  setHeader:(key,value)=>{result.headers[key]=value},
  status:code=>{result.status=code;return res},
  json:body=>{result.body=body;return res},
 }
 await resolveProductUrl({params:{handle},scope:container},res)
 assert.equal(result.headers['Cache-Control'],'no-store')
 return result
}

test('current English URL resolves but retired imports, aliases and legacy hashes stay missing', async()=>{
 const source='https://tamir.ua/aksessuary/shapki/model-gray.html'
 await db('product').insert([
  {id:'retired',handle:'old-gray-hat',deleted_at:new Date(),metadata:{rozetka_product_key:source,rozetka_legacy_handle:'rozetka-c4b30d3cd9ab189bdc38'}},
  {id:'replacement',handle:'new-gray-hat',metadata:{rozetka_product_key:source,rozetka_url:source,rozetka_legacy_handle:'rozetka-0123456789abcdef0123'}},
 ])
 await db('tamir_product_url').insert([
  {handle:'retired-english-gray-hat',product_id:'retired',is_current:true},
  {handle:'previous-english-gray-hat',product_id:'replacement',is_current:false},
  {handle:'current-english-gray-hat',product_id:'replacement',is_current:true},
 ])
 const beforeProducts=await db('product').orderBy('id')
 const beforeUrls=await db('tamir_product_url').orderBy('handle')
 const current=await resolve('current-english-gray-hat')
 assert.equal(current.status,200);assert.deepEqual(current.body,{handle:'new-gray-hat'})
 for(const handle of ['old-gray-hat','retired-english-gray-hat','previous-english-gray-hat',
  'rozetka-c4b30d3cd9ab189bdc38','rozetka-0123456789abcdef0123','unknown-hat','x'.repeat(256)]) {
  const result=await resolve(handle)
  assert.equal(result.status,404,handle);assert.deepEqual(result.body,{handle:null})
 }
 assert.deepEqual(await db('product').orderBy('id'),beforeProducts)
 assert.deepEqual(await db('tamir_product_url').orderBy('handle'),beforeUrls)
 for(const status of ['draft','proposed','rejected']) {
  await db('product').where({id:'replacement'}).update({status})
  assert.equal((await resolve('current-english-gray-hat')).status,404)
 }
 await db('product').where({id:'replacement'}).update({status:'published',deleted_at:new Date()})
 assert.equal((await resolve('current-english-gray-hat')).status,404)
})
