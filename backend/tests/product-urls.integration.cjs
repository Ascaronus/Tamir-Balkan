const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { ContainerRegistrationKeys, Modules } = require('@medusajs/framework/utils')
const { productUrlSchema, syncProductUrl, englishProductText } = require('../src/utils/product-urls')
const { supplierProductUrls, resolveReimportedProductHandle } = require('../src/utils/reimported-product-urls')
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

test('reimport restores old SR, EN and hash URLs by supplier model, without changing products', async()=>{
 const oldSource='https://tamir.ua/ua/aksessuary/shapki/model-gray.html'
 const newSource='https://tamir.ua/aksessuary/shapki/model-gray.html'
 await db('product').insert([
  {id:'retired',handle:'old-gray-hat',deleted_at:new Date(),metadata:{rozetka_product_key:oldSource,rozetka_legacy_handle:'rozetka-c4b30d3cd9ab189bdc38'}},
  {id:'replacement',handle:'new-gray-hat',metadata:{rozetka_product_key:newSource,rozetka_url:newSource}},
 ])
 await db('tamir_product_url').insert({handle:'old-english-gray-hat',product_id:'retired',is_current:true})
 const before=await db('product').orderBy('id')
 for(const handle of ['old-gray-hat','old-english-gray-hat','rozetka-c4b30d3cd9ab189bdc38']) {
  assert.equal(await resolveReimportedProductHandle(db,handle),'new-gray-hat')
  assert.equal(await resolveReimportedProductHandle(db,handle),'new-gray-hat')
 }
 assert.deepEqual(await db('product').orderBy('id'),before)
 assert.equal(await resolveReimportedProductHandle(db,'unknown-hat'),null)
 await db('product').where({id:'replacement'}).update({status:'draft'})
 assert.equal(await resolveReimportedProductHandle(db,'old-gray-hat'),null)
 await db('product').where({id:'replacement'}).update({status:'published'})
 await db('product').insert({id:'duplicate',handle:'another-hat',status:'draft',metadata:{rozetka_url:newSource}})
 assert.equal(await resolveReimportedProductHandle(db,'old-gray-hat'),null)
 await db('product').where({id:'duplicate'}).delete()
 await db('product').insert({id:'unrelated',handle:'old-gray-hat',status:'draft',metadata:{}})
 assert.equal(await resolveReimportedProductHandle(db,'old-gray-hat'),null)
 await db('product').where({id:'unrelated'}).delete()
 await db('product').where({id:'replacement'}).update({metadata:{rozetka_url:newSource.replace('gray','black')}})
 assert.equal(await resolveReimportedProductHandle(db,'old-gray-hat'),null)
 await db('product').where({id:'replacement'}).update({metadata:{rozetka_url:newSource,rozetka_product_key:newSource.replace('gray','black')}})
 assert.equal(await resolveReimportedProductHandle(db,'old-gray-hat'),null)
})

test('supplier identity accepts language/host aliases but rejects unsafe or conflicting sources',()=>{
 const source='https://tamir.ua/aksessuary/shapki/gray.html'
 assert.deepEqual(supplierProductUrls({rozetka_url:source}),supplierProductUrls({rozetka_product_key:source.replace('tamir.ua/','www.tamir.ua/ua/')+'/'}))
 for(const value of [null,{}, {rozetka_url:'https://example.org/gray.html'}, {rozetka_url:source+'?id=1'},
  {rozetka_url:source,rozetka_product_key:source.replace('gray','blue')}, {rozetka_url:'https://tamir.ua/'}]) assert.deepEqual(supplierProductUrls(value),[])
})
