const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { ContainerRegistrationKeys, Modules } = require('@medusajs/framework/utils')
const { syncCategoryLocalization } = require('../src/utils/category-localization')
const connection = process.env.TEST_REVIEWS_DB_URL
if (!connection) throw Error('Set TEST_REVIEWS_DB_URL to an isolated test database')
const knex = require('knex'), schema = 'tamir_category_test_' + process.pid
const root = knex({ client:'pg', connection })
const db = knex({ client:'pg', connection, searchPath:[schema] })
const rows = []
const container = { resolve(key) {
  if (key === ContainerRegistrationKeys.PG_CONNECTION) return db
  if (key === Modules.TRANSLATION) return {
    listTranslations: async selector => rows.filter(row => Object.entries(selector).every(([key,value]) => row[key] === value)),
    createTranslations: async row => rows.push({id:'tr-'+rows.length,...row}),
    updateTranslations: async data => Object.assign(rows.find(row=>row.id===data.id),data),
  }
  throw Error('Unknown dependency '+key)
}}
before(async()=>{
  await root.raw(`CREATE SCHEMA ${schema}`)
  await db.schema.createTable('product_category', t=>{t.text('id').primary();t.text('name');t.text('handle');t.jsonb('metadata');t.timestamp('deleted_at').nullable()})
  for(const [id,name,handle] of [['hat','Hats','hats'],['belt','Dress belt','dress-belt'],['other','Hats','kape']])
    await db('product_category').insert({id,name,handle,metadata:{manual:'keep'}})
  rows.push({id:'manual',reference:'product_category',reference_id:'belt',locale_code:'sr-RS',translations:{name:'Kaiševi za odelo',description:'Reviewed'}})
})
after(async()=>{await db.destroy();await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await root.destroy()})
test('backfill writes visible native translations without replacing admin edits, preserving metadata and old URLs',async()=>{
  await syncCategoryLocalization(container,'hat',true)
  await syncCategoryLocalization(container,'belt',true)
  assert.equal(rows.find(r=>r.reference_id==='hat'&&r.locale_code==='sr-RS').translations.name,'Kape')
  assert.deepEqual(rows.find(r=>r.id==='manual').translations,{name:'Kaiševi za odelo',description:'Reviewed'})
  const hat=await db('product_category').where({id:'hat'}).first()
  assert.equal(hat.metadata.category_handles.sr,'kape-2') // original handle already belongs to another category
  assert.equal(hat.metadata.category_handles.en,'hats')
  assert.deepEqual(hat.metadata.category_handle_aliases,['hats'])
  assert.equal(hat.metadata.manual,'keep');assert.equal(hat.handle,'hats')
  const belt=await db('product_category').where({id:'belt'}).first()
  assert.equal(belt.metadata.category_handles.sr,'kaisevi-za-odelo')
  rows.find(r=>r.reference_id==='hat'&&r.locale_code==='sr-RS').translations.name='Zimske kape'
  await db('product_category').where({id:'hat'}).update({handle:'new-base'})
  await syncCategoryLocalization(container,'hat',true)
  const again=await db('product_category').where({id:'hat'}).first()
  assert.equal(again.metadata.category_handles.sr,'kape-2')
  assert.deepEqual(again.metadata.category_handle_aliases,['hats','new-base'])
})
test('parallel category updates reserve unique localized addresses',async()=>{
  for(const id of ['a','b']) {
    await db('product_category').insert({id,name:'Hats',handle:'base-'+id})
  }
  await Promise.all(['a','b'].map(id=>syncCategoryLocalization(container,id,true)))
  const categories=await db('product_category').whereIn('id',['a','b']).select('metadata')
  assert.equal(new Set(categories.map(c=>c.metadata.category_handles.sr)).size,2)
  assert.equal(new Set(categories.map(c=>c.metadata.category_handles.en)).size,2)
})
