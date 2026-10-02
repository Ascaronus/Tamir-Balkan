const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
require('ts-node/register/transpile-only')
const { parseFeed, sourceUrl, fetchSource } = require('../src/utils/rozetka-preview')
const { initialDraft, draftErrors } = require('../src/shared/rozetka-import')
const xml = `<yml_catalog><shop><categories><category id="8">Шапки</category></categories><offers>
<offer id="a" available="true"><url>https://tamir.ua/hats/model.html?size=58</url><name>Шапка TAMIR 58 TMR_123</name><price>100,50</price><currencyId>UAH</currencyId><categoryId>8</categoryId><picture>https://tamir.ua/images/a.jpg</picture><description>&lt;p&gt;Описание&lt;/p&gt;</description><stock_quantity>10</stock_quantity><param name="Размер">58</param><param name="Цвет">цвет</param></offer>
<offer id="b" available="false"><url>https://tamir.ua/hats/model.html?size=60</url><name>Шапка TAMIR 60 TMR_123</name><price>120</price><currencyId>UAH</currencyId><categoryId>8</categoryId><picture>https://tamir.ua/images/b.jpg</picture><stock_quantity>5</stock_quantity><param name="Размер">60</param></offer>
</offers></shop></yml_catalog>`
const source = parseFeed(xml).products[0]
function valid() {
 const draft = initialDraft(source)
 draft.category_id = 'cat'; draft.title_sr = 'Kapa'; draft.title_en = 'Hat'
 draft.variants.forEach(v => { v.price = '1 500,50'; v.stock = '2' })
 return { draft, settings: { stock_location_id: 'loc', sales_channel_id: 'sc', image_mode: 'remote' } }
}
const actions = []; let state
const oldLoad = Module._load
const flows = Object.fromEntries(['createProductsWorkflow','updateProductsWorkflow','createProductVariantsWorkflow','updateProductVariantsWorkflow','createInventoryLevelsWorkflow','linkSalesChannelsToStockLocationWorkflow'].map(name => [name, () => ({run: async ({input}) => {
 actions.push({name,input})
 if (name === 'createProductsWorkflow') {
  const p = input.products[0]; state.product = {...p,id:'prod',updated_at:'2026-10-02T10:00:00.000Z',categories:[],options:p.options.map((o,i)=>({...o,id:'opt'+i,values:o.values.map(value=>({value}))})),variants:[]}
  return {result:[state.product]}
 }
 if (name === 'updateProductsWorkflow') { Object.assign(state.product,input.products[0]); return {result:[state.product]} }
 if (name === 'createProductVariantsWorkflow') {
  if (state.failVariant) { state.failVariant=false; throw Error('injected failure') }
  for(const v of input.product_variants) state.product.variants.push({...v,id:'var'+state.product.variants.length,options:Object.entries(v.options).map(([title,value])=>({option_id:state.product.options.find(o=>o.title===title).id,value})),inventory_items:[{inventory_item_id:'item'+state.product.variants.length}]})
 }
 if (name === 'updateProductVariantsWorkflow') for(const v of input.product_variants) Object.assign(state.product.variants.find(p=>p.id===v.id), {...v,options:Object.entries(v.options).map(([title,value])=>({option_id:state.product.options.find(o=>o.title===title).id,value}))})
 if (name === 'createInventoryLevelsWorkflow') state.levels.push(...input.inventory_levels.map(v=>({...v,id:'level'+state.levels.length,reserved_quantity:0})))
 return {result:[]}
}})]))
Module._load = function(name, parent, main) { return name === '@medusajs/medusa/core-flows' ? flows : oldLoad.call(this,name,parent,main) }
const { validateImport, executeImport, findImported } = require('../src/utils/rozetka-admin')
Module._load = oldLoad
const { Modules, ContainerRegistrationKeys } = require('@medusajs/framework/utils')
function setup() {
 state={product:null, levels:[],translations:[],locked:false}; actions.length=0
 const product={
  retrieveProductCategory:async()=>({id:'cat',is_active:true,is_internal:false}),
  retrieveProduct:async()=>state.product,
  updateProducts:async(id,data)=>{Object.assign(state.product,data);return state.product},
  updateProductOptions:async(id,data)=>{Object.assign(state.product.options.find(o=>o.id===id),{values:data.values.map(value=>({value}))})},
  listProductVariants:async({sku})=>(state.product?.variants||[]).filter(v=>v.sku===sku),
 }
 const db={client:{acquireConnection:async()=>({}),releaseConnection:async()=>{state.released=true}},raw(sql){return {connection:async()=>({rows:[{locked:sql.includes('try')?!state.locked:true}]})}}}
 const container={resolve(key){
  if(key===Modules.PRODUCT)return product
  if(key===ContainerRegistrationKeys.PG_CONNECTION)return db
  if(key===ContainerRegistrationKeys.LOGGER)return {error:()=>{}}
  if(key===Modules.SALES_CHANNEL)return {retrieveSalesChannel:async()=>({is_disabled:false})}
  if(key===Modules.STOCK_LOCATION)return {retrieveStockLocation:async()=>({id:'loc'})}
  if(key===Modules.FULFILLMENT)return {listShippingProfiles:async()=>[{id:'sp'}]}
  if(key===Modules.TRANSLATION)return {listTranslations:async({locale_code})=>state.translations.filter(t=>t.locale_code===locale_code),createTranslations:async data=>{state.translations.push({...data,id:'tr'+state.translations.length});return data},updateTranslations:async data=>Object.assign(state.translations.find(t=>t.id===data.id),data)}
  if(key===Modules.INVENTORY)return {listInventoryLevels:async({inventory_item_id,location_id})=>state.levels.filter(l=>l.inventory_item_id===inventory_item_id&&l.location_id===location_id),updateInventoryLevels:async(data)=>{for(const l of data)Object.assign(state.levels.find(x=>x.id===l.id),l)}}
  if(key===ContainerRegistrationKeys.QUERY)return {graph:async args=>{
   if(args.entity==='product')return {data:state.product?[state.product]:[]}
   if(args.entity==='product_variant')return {data:(state.product?.variants||[]).filter(v=>args.filters.sku.includes(v.sku))}
   throw Error('unexpected graph '+args.entity)
  }}
  throw Error('unexpected dependency '+key)
 }}
 return container
}

test('real XML parser groups size offers, preserves model and photos, reports placeholder colors',()=>{
 assert.equal(parseFeed('<!DOCTYPE yml_catalog SYSTEM "shops.dtd">'+xml).products.length,1)
 const feed=parseFeed(xml)
 assert.equal(feed.products.length,1);assert.equal(source.variants.length,2)
 assert.equal(source.title,'Шапка TAMIR TMR_123');assert.equal(source.variants[0].price,100.5)
 assert.equal(source.variants[1].stock,0);assert.equal(source.variants[0].color,'')
 assert.equal(source.images.length,2);assert.equal(feed.source_categories[0].count,1)
 assert.ok(source.warnings.some(w=>w.includes('цвет')))
 const draft=initialDraft(source);assert.equal(draft.status,'draft');assert.equal(draft.variants[0].stock,'0');assert.equal(draft.variants[0].price,'')
})
test('XML rejects duplicate IDs, DTDs, malformed documents and non-Tamir URLs',()=>{
 assert.throws(()=>parseFeed(xml.replace('id="b"','id="a"')),/повторяется/)
 assert.throws(()=>parseFeed('<!DOCTYPE x>'+xml),/XML/)
 assert.throws(()=>parseFeed('<broken>'),/XML/)
 for(const url of ['http://tamir.ua/x','https://tamir.ua.attacker.test/x','https://127.0.0.1/x','https://user@tamir.ua/x','https://tamir.ua:9000/x']) assert.throws(()=>sourceUrl(url))
})
test('server rejects source tampering, foreign images, duplicate variants and invalid amounts',()=>{
 const body=valid();assert.equal(validateImport(body,source).draft.title,source.title)
 for(const change of [b=>b.draft.fingerprint='a'.repeat(64),b=>b.draft.images.push('https://tamir.ua/other.jpg'),b=>b.draft.variants.push(b.draft.variants[0]),b=>b.draft.variants[0].price='Infinity',b=>b.draft.variants[0].stock='-1',b=>b.draft.variants[0].stock='1.2',b=>b.draft.category_id='',b=>b.draft.variants.forEach(v=>v.selected=false),b=>b.draft.variants[0].color='Black']) {const copy=structuredClone(body);change(copy);assert.throws(()=>validateImport(copy,source))}
 assert.equal(draftErrors(body.draft).length,0)
})
test('source lookup never adopts unrelated products by handle',()=>{
 assert.throws(()=>findImported([{id:'manual',handle:source.handle,metadata:{}}],source),/занят/)
 assert.throws(()=>findImported([{metadata:{rozetka_product_key:source.url}},{metadata:{rozetka_product_key:source.url}}],source),/несколько/)
})
test('redirects and oversized downloads fail closed',async()=>{
 const previous=global.fetch
 try {
  global.fetch=async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/'}})
  await assert.rejects(fetchSource('https://tamir.ua/image.jpg',10),/HTTPS/)
  global.fetch=async()=>new Response('1234567890123')
  await assert.rejects(fetchSource('https://tamir.ua/image.jpg',10),/размер/)
 }finally{global.fetch=previous}
})
test('imports only selected variants, writes reviewed RSD prices, translations and chosen warehouse, then replays safely',async()=>{
 const c=setup(), body=valid(), original=global.fetch
 global.fetch=async()=>new Response(xml)
 try {
  body.draft.variants[1].selected=false
  const result=await executeImport(c,body,'admin')
  assert.equal(result.action,'created');assert.equal(state.product.variants.length,1);assert.equal(state.product.status,'draft')
  assert.equal(state.product.variants[0].prices[0].amount,1500.5);assert.equal(state.levels[0].location_id,'loc');assert.equal(state.levels[0].stocked_quantity,2)
  assert.equal(state.translations.find(t=>t.locale_code==='sr-RS').translations.title,'Kapa')
  const writes=actions.length;assert.equal((await executeImport(c,body,'admin')).action,'replayed');assert.equal(actions.length,writes)
  assert.equal(state.released,true)
 }finally{global.fetch=original}
})
test('failure leaves a draft, retry resumes it without creating a second product',async()=>{
 const c=setup(),body=valid();state.failVariant=true
 await assert.rejects(executeImport(c,body,'admin'),e=>e.product_id==='prod')
 assert.equal(state.product.status,'draft');assert.equal(state.product.metadata.rozetka_admin_import.state,'processing')
 await executeImport(c,body,'admin')
 assert.equal(actions.filter(a=>a.name==='createProductsWorkflow').length,1)
 assert.equal(state.product.variants.length,2);assert.equal(state.product.metadata.rozetka_admin_import.state,'complete')
})
test('existing product requires explicit update and current version, unselected variants and other warehouse stock survive',async()=>{
 const c=setup(),body=valid();await executeImport(c,body,'admin')
 const changed=structuredClone(body);changed.draft.title='Changed'
 await assert.rejects(executeImport(c,changed,'admin'),/явно/)
 changed.draft.mode='update';changed.draft.existing_id='prod';changed.draft.existing_updated_at='old'
 await assert.rejects(executeImport(c,changed,'admin'),/изменён/)
 changed.draft.existing_updated_at=new Date(state.product.updated_at).toISOString();changed.draft.variants[1].selected=false
 state.levels.push({id:'other',inventory_item_id:'item0',location_id:'other',stocked_quantity:88})
 changed.draft.variants[0].stock='7';await executeImport(c,changed,'admin')
 assert.equal(state.product.variants.length,2);assert.equal(state.levels.find(l=>l.id==='other').stocked_quantity,88)
 assert.equal(state.levels.find(l=>l.inventory_item_id==='item1').stocked_quantity,2)
})
test('concurrent request fails before product writes and releases lock connection',async()=>{
 const c=setup();state.locked=true
 await assert.rejects(executeImport(c,valid(),'admin'),/уже импортируется/)
 assert.equal(actions.length,0);assert.equal(state.released,true)
})

test('uploaded XML is isolated from URL cache and imports without downloading the default feed',async()=>{
 const {loadFeed,ROZETKA_SOURCE}=require('../src/utils/rozetka-preview')
 assert.equal(ROZETKA_SOURCE,'https://tamir.ua/ua/rozetka/')
 const original=global.fetch; const uploads=xml.replaceAll('model.html','uploaded.html').replaceAll('Шапка TAMIR','Загруженная шапка')
 global.fetch=async()=>{throw Error('upload must not make network request')}
 try {
  const sourceInput={type:'file',name:'catalog.xml',xml:uploads}
  const feed=await loadFeed(true,sourceInput);assert.match(feed.products[0].title,/Загруженная/)
  const c=setup(),body=valid();body.source=sourceInput;body.draft=initialDraft(feed.products[0]);body.draft.category_id='cat';body.draft.variants.forEach(v=>{v.price='100';v.stock='0'})
  assert.equal((await executeImport(c,body,'admin')).action,'created')
  await assert.rejects(loadFeed(true,{type:'file',name:'bad.xml',xml:'<broken>'}),/XML/)
  await assert.rejects(loadFeed(true,{type:'file',name:'large.xml',xml:'я'.repeat(6*1024*1024)}),/10 МБ/)
 } finally {global.fetch=original}
})

test('editable URL is used and cached separately for each source',async()=>{
 const {loadFeed}=require('../src/utils/rozetka-preview'),original=global.fetch,calls=[]
 global.fetch=async url=>{calls.push(url);return new Response(xml.replaceAll('Шапка TAMIR',url.includes('/ua/')?'UA title':'RU title'))}
 try {
  assert.match((await loadFeed(true,{type:'url',url:'https://tamir.ua/ua/rozetka/'})).products[0].title,/UA title/)
  assert.match((await loadFeed(false,{type:'url',url:'https://tamir.ua/rozetka/'})).products[0].title,/RU title/)
  assert.equal(calls.length,2)
 } finally {global.fetch=original}
})
