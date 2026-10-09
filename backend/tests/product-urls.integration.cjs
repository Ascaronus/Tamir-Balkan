const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { ContainerRegistrationKeys, Modules } = require('@medusajs/framework/utils')
const { productUrlSchema, syncProductUrl, englishProductText } = require('../src/utils/product-urls')
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
 await db.schema.createTable('product', t=>{t.text('id').primary();t.text('handle');t.jsonb('metadata');t.timestamp('deleted_at').nullable()})
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
