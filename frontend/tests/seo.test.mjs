import test from "node:test"
import assert from "node:assert/strict"
import { siteUrl, serializeJsonLd } from "../src/lib/seo.ts"

test("structured data cannot close the script element", () => {
  const input = { name: "</script><script>alert(1)</script>" }
  const encoded = serializeJsonLd(input)
  assert.equal(encoded.includes("<"), false)
  assert.deepEqual(JSON.parse(encoded), input)
})
test("canonical URLs use the configured public origin", () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tamir.rs/"
    assert.equal(siteUrl("/rs/products/suit"), "https://tamir.rs/rs/products/suit")
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = old
  }
})

import { load } from '../test-support/component-harness.mjs'
test('public legal pages explicitly allow indexing',async()=>{
 for(const [page,contentKey] of [['privacy','privacyPolicy'],['terms','terms']]) {
  const moduleUnderTest=load(`frontend/src/app/${page}/page.tsx`,{
   'next/link':'Link','@/components/store/StoreShell':{},'@/components/privacy/CookieConsent':{},
   '@/lib/i18n/server':{getTranslations:async()=>({locale:'en'})},
   '@/lib/legal/content':{[contentKey]:{en:{title:page}}},'@/lib/seo':{siteUrl},
  })
  const metadata=await moduleUnderTest.generateMetadata()
  assert.equal(metadata.robots.index,true)
  assert.equal(metadata.alternates.canonical,siteUrl('/'+page))
 }
})
test('private shopping and account pages retain noindex',()=>{
 for(const page of ['account','cart','checkout','order']) {
  const {metadata}=load(`frontend/src/app/[countryCode]/${page}/layout.tsx`)
  assert.equal(metadata.robots.index,false)
 }
})
test('sitemap includes public legal pages and products but no private routes',async()=>{
 const sitemap=load('frontend/src/app/sitemap.ts',{
  '@/lib/seo':{siteUrl},'@/lib/store/products':{listProductsByCountry:async()=>({products:[{handle:'test-tie'}],count:1})},
  '@/lib/store/categories':{listStoreProductCategories:async()=>[]},
 }).default
 const entries=await sitemap()
 assert.deepEqual(Array.from(entries,e=>e.url),['/','/cookies','/privacy','/terms','/rs/products/test-tie'].map(p=>siteUrl(p)))
})


test('robots allows reading noindex HTML while retaining the API crawl restriction',()=>{
 const rules=load('frontend/src/app/robots.ts',{'@/lib/seo':{siteUrl}}).default()
 assert.deepEqual(Array.from(rules.rules.disallow),['/api/'])
 assert.equal(rules.sitemap,siteUrl('/sitemap.xml'))
})
test('sitemap includes populated categories and pagination with canonical URLs, excluding empty categories and resources',async()=>{
 const sitemap=load('frontend/src/app/sitemap.ts',{
  '@/lib/seo':{siteUrl},
  '@/lib/store/categories':{listStoreProductCategories:async()=>[{id:'hats',category_children:[{id:'scarves'}]},{id:'scarves'},{id:'empty'}]},
  '@/lib/store/products':{listProductsByCountry:async args=>args.categoryId?{products:[],count:{hats:27,scarves:6,empty:0}[args.categoryId]}:{products:Array.from({length:33},(_,i)=>({handle:'item-'+i})),count:33}},
 }).default
 const urls=Array.from(await sitemap(),e=>e.url)
 assert.equal(urls.length,41);assert.equal(new Set(urls).size,41)
 for(const path of ['/rs/catalog?page=2','/rs/catalog?category_id=hats','/rs/catalog?category_id=hats&page=2','/rs/catalog?category_id=scarves'])assert.ok(urls.includes(siteUrl(path)))
 assert.ok(!urls.some(url=>/empty|v_id|rozetka-|robots|sitemap|woff|account|sort=/.test(url)))
})
function catalogPage({category={id:'hats',name:'Kape'},count=27}={}) {
 return load('frontend/src/app/[countryCode]/catalog/page.tsx',{
  'next/image':{},'next/link':{},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND')}},
  '@/lib/reviews/server':{},'@/lib/store/search-params':{normalizeCatalogQuery:q=>({category_id:q.category_id||'',page:q.page||'1',q:q.q||''})},
  '@/lib/store/catalog':{},'@/lib/store/regions':{},
  '@/lib/store/categories':{getStoreProductCategoryById:async()=>category},
  '@/lib/store/products':{listProductsByCountry:async()=>({products:[],count})},
  '@/components/store/StoreShell':{},'@/components/store/CatalogClient':{},
  '@/lib/i18n/server':{getTranslations:async()=>({locale:'sr',t:()=> 'Katalog'})},'@/lib/seo':{siteUrl},
 })
}
test('catalog metadata indexes populated categories and preserves the canonical without variant, sort and filter parameters',async()=>{
 const page=catalogPage()
 let result=await page.generateMetadata({searchParams:Promise.resolve({category_id:'hats',sort:'price_desc',color:'black'})})
 assert.equal(result.robots.index,true);assert.equal(result.robots.follow,true)
 assert.equal(result.alternates.canonical,siteUrl('/rs/catalog?category_id=hats'))
 assert.match(result.description,/Kape/)
 result=await page.generateMetadata({searchParams:Promise.resolve({category_id:'hats',page:'2'})})
 assert.equal(result.alternates.canonical,siteUrl('/rs/catalog?category_id=hats&page=2'))
 result=await page.generateMetadata({searchParams:Promise.resolve({sort:'newest'})})
 assert.equal(result.robots.index,true);assert.equal(result.alternates.canonical,siteUrl('/'))
})
test('empty categories and internal search stay noindex, populated categories become indexable, and unknown categories are 404',async()=>{
 const empty=await catalogPage({count:0}).generateMetadata({searchParams:Promise.resolve({category_id:'hats'})})
 assert.equal(empty.robots.index,false);assert.equal(empty.robots.follow,true)
 const search=await catalogPage().generateMetadata({searchParams:Promise.resolve({q:'kapa'})})
 assert.equal(search.robots.index,false)
 await assert.rejects(catalogPage({category:null}).generateMetadata({searchParams:Promise.resolve({category_id:'invalid'})}),/NOT_FOUND/)
})
