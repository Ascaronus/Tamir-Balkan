import test from 'node:test'
import assert from 'node:assert/strict'
import { load } from '../test-support/component-harness.mjs'
const requests=[]
const catalog=load('frontend/src/lib/store/catalog.ts',{
 '@/lib/medusa':{sdk:{client:{fetch:async(path,options)=>{requests.push({path,options});return {products:[],count:0}}}}},
 '@/lib/i18n/config':{medusaStoreLocale:locale=>locale},
 './search-params':{queryText:value=>(Array.isArray(value)?value[0]:value)?.trim()||''},
})
test('catalog sends repeated decimal sizes, comma prices, zero, regional pricing and customer authorization',async()=>{
 const selection=catalog.catalogSelection({size:['42,5','50'],color:[' Crna ','siva'],min_price:'0',max_price:'9999,5',sort:'price_asc',page:'2'})
 const controller=new AbortController()
 await catalog.fetchCatalog(selection,'reg-rs','sr',{token:'customer-test',signal:controller.signal})
 const request=requests.at(-1),url=new URL(request.path,'https://example.test')
 assert.deepEqual(url.searchParams.getAll('size'),['42,5','50'])
 assert.deepEqual(url.searchParams.getAll('color'),['crna','siva'])
 assert.equal(url.searchParams.get('min_price'),'0');assert.equal(url.searchParams.get('max_price'),'9999,5')
 assert.equal(url.searchParams.get('region_id'),'reg-rs');assert.equal(url.searchParams.get('country_code'),'rs')
 assert.equal(url.searchParams.get('offset'),'24');assert.equal(url.searchParams.has('page'),false)
 assert.equal(request.options.headers.authorization,'Bearer customer-test');assert.equal(request.options.signal,controller.signal)
 assert.equal(request.options.cache,'no-store')
})
test('changing catalog page preserves all filters and sort without comma splitting',()=>{
 const s=catalog.catalogSelection({q:' suit ',category_id:'cat',size:'42,5',min_price:'100,5',sort:'popularity',page:'3'})
 const next=catalog.catalogParams({...s,page:1})
 assert.equal(next.has('page'),false);assert.equal(next.get('size'),'42,5');assert.equal(next.get('q'),'suit')
 assert.equal(next.get('category_id'),'cat');assert.equal(next.get('sort'),'popularity');assert.equal(next.get('min_price'),'100,5')
 assert.equal(catalog.catalogSelection({sort:'unsafe',page:'-5'}).sort,'newest')
 assert.equal(catalog.catalogSelection({page:'-5'}).page,1)
})
test('product price matches tax-inclusive catalog values and preserves zero or fractional amounts',()=>{
 const commerce=load('frontend/src/lib/store/commerce.ts')
 assert.equal(commerce.variantAmount({calculated_amount:1000,calculated_amount_with_tax:1200.5}),1200.5)
 assert.equal(commerce.variantAmount({calculated_amount:1000,calculated_amount_with_tax:0}),0)
 assert.equal(commerce.variantAmount({calculated_amount:1000.5}),1000.5)
 assert.equal(commerce.variantAmount(null),undefined)
 const {formatMoney}=load('frontend/src/lib/format-money.ts')
 assert.match(formatMoney(18900,'rsd'),/18.900,00/)
 assert.match(formatMoney(0.5,'rsd'),/0,50/)
})
