import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { siteUrl, serializeJsonLd, languageAlternates } from "../src/lib/seo.ts"
import { categoryPath, categoryRedirectPath } from "../src/lib/store/category-url.ts"
import { queryText, normalizeCatalogQuery } from "../src/lib/store/search-params.ts"
const { resolveRouteData } = createRequire(import.meta.url)("next/dist/build/webpack/loaders/metadata/resolve-route-data.js")

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

import { load, find } from '../test-support/component-harness.mjs'
const catalog = load('frontend/src/lib/store/catalog.ts', {
 '@/lib/medusa': {}, '@/lib/i18n/config': {}, './search-params': { queryText },
})
test('public legal pages explicitly allow indexing',async()=>{
 for(const [page,contentKey] of [['privacy','privacyPolicy'],['terms','terms']]) {
  const moduleUnderTest=load(`frontend/src/app/${page}/page.tsx`,{
   '@/components/i18n/LocalizedLink':'Link','@/components/store/StoreShell':{},'@/components/privacy/CookieConsent':{},
   '@/lib/i18n/server':{getTranslations:async()=>({locale:'en'})},
   '@/lib/legal/content':{[contentKey]:{en:{title:page}}},'@/lib/seo':{siteUrl,languageAlternates},
  })
  const metadata=await moduleUnderTest.generateMetadata()
  assert.equal(metadata.robots.index,true)
  assert.equal(metadata.alternates.canonical,siteUrl('/en/'+page))
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
  '@/lib/seo':{siteUrl,languageAlternates},'@/lib/store/products':{listProductsByCountry:async()=>({products:[{handle:'test-tie'}],count:1})},
  '@/lib/store/categories':{listStoreProductCategories:async()=>[]},
  '@/lib/store/category-url':{categoryPath},
 }).default
 const entries=await sitemap()
 assert.deepEqual(Array.from(entries,e=>e.url),['/','/en','/cookies','/en/cookies','/privacy','/en/privacy','/terms','/en/terms','/rs/products/test-tie'].map(p=>siteUrl(p)))
})


test('robots allows reading noindex HTML while retaining the API crawl restriction',()=>{
 const rules=load('frontend/src/app/robots.ts',{'@/lib/seo':{siteUrl,languageAlternates}}).default()
 assert.deepEqual(Array.from(rules.rules.disallow),['/api/'])
 assert.equal(rules.sitemap,siteUrl('/sitemap.xml'))
})
test('sitemap includes populated categories and pagination with canonical URLs, excluding empty categories and resources',async()=>{
 const sitemap=load('frontend/src/app/sitemap.ts',{
  '@/lib/seo':{siteUrl,languageAlternates},
  '@/lib/store/categories':{listStoreProductCategories:async()=>[{id:'hats',handle:'hats',category_children:[{id:'scarves',handle:'Scarves'}]},{id:'scarves',handle:'Scarves'},{id:'empty',handle:'empty'}]},
  '@/lib/store/category-url':{categoryPath},
  '@/lib/store/products':{listProductsByCountry:async args=>args.categoryId?{products:[],count:{hats:27,scarves:6,empty:0}[args.categoryId]}:{products:Array.from({length:33},(_,i)=>({handle:'item-'+i})),count:33}},
 }).default
 const xml=resolveRouteData(await sitemap(),'sitemap')
 assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml),'sitemap XML must escape query separators')
 const urls=Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g),match=>match[1].replace(/&amp;/g,'&'))
 assert.equal(urls.length,49);assert.equal(new Set(urls).size,49)
 for(const path of ['/rs/catalog?page=2','/rs/catalog/hats','/rs/catalog/hats?page=2','/rs/catalog/Scarves'])assert.ok(urls.includes(siteUrl(path)))
 assert.ok(!urls.some(url=>/empty|v_id|rozetka-|robots|sitemap|woff|account|sort=|category_id=/.test(url)))
})
function catalogPage({category={id:'pcat_hats',name:'Kape',handle:'hats'},count=27}={}) {
 return load('frontend/src/app/[countryCode]/catalog/page.tsx',{
  'next/image':{},'@/components/i18n/LocalizedLink':{},'next/navigation':{notFound:()=>{throw Error('NOT_FOUND')},permanentRedirect:location=>{throw Object.assign(Error('REDIRECT'),{location})}},
  '@/lib/reviews/server':{},'@/lib/store/search-params':{normalizeCatalogQuery,queryText},
  '@/lib/store/catalog':catalog,'@/lib/store/regions':{getRegionByCountry:async()=>null},
  '@/lib/store/categories':{getStoreProductCategoryById:async()=>category,getStoreProductCategoryByHandle:async()=>category,listStoreProductCategories:async()=>category?[category]:[]},
  '@/lib/store/category-url':{categoryPath,categoryRedirectPath},
  '@/lib/store/products':{listProductsByCountry:async()=>({products:[],count})},
  '@/components/store/StoreShell':{StoreShell:'StoreShell'},'@/components/store/CatalogClient':{CatalogClient:'CatalogClient'},
  '@/lib/i18n/server':{getTranslations:async()=>({locale:'sr',t:()=> 'Katalog'})},'@/lib/seo':{siteUrl,languageAlternates},
 })
}
test('catalog metadata indexes populated categories and preserves the canonical without variant, sort and filter parameters',async()=>{
 const page=catalogPage()
 const params=Promise.resolve({countryCode:'rs',categoryHandle:'hats'})
 let result=await page.generateMetadata({params,searchParams:Promise.resolve({sort:'price_desc',color:'black'})})
 assert.equal(result.robots.index,true);assert.equal(result.robots.follow,true)
 assert.equal(result.alternates.canonical,siteUrl('/rs/catalog/hats'))
 assert.match(result.description,/Kape/)
 result=await page.generateMetadata({params,searchParams:Promise.resolve({page:'2'})})
 assert.equal(result.alternates.canonical,siteUrl('/rs/catalog/hats?page=2'))
 result=await page.generateMetadata({searchParams:Promise.resolve({sort:'newest'})})
 assert.equal(result.robots.index,true);assert.equal(result.alternates.canonical,siteUrl('/'))
})
test('empty categories and internal search stay noindex, populated categories become indexable, and unknown categories are 404',async()=>{
 const empty=await catalogPage({count:0}).generateMetadata({params:Promise.resolve({categoryHandle:'hats'}),searchParams:Promise.resolve({})})
 assert.equal(empty.robots.index,false);assert.equal(empty.robots.follow,true)
 const search=await catalogPage().generateMetadata({searchParams:Promise.resolve({q:'kapa'})})
 assert.equal(search.robots.index,false)
 await assert.rejects(catalogPage({category:null}).generateMetadata({searchParams:Promise.resolve({category_id:'invalid'})}),/NOT_FOUND/)
 await assert.rejects(catalogPage({category:null}).generateMetadata({params:Promise.resolve({categoryHandle:'invalid'}),searchParams:Promise.resolve({})}),/NOT_FOUND/)
})

test('legacy category URLs permanently redirect and preserve repeated filters and pagination',async()=>{
 const props={params:Promise.resolve({countryCode:'rs'}),searchParams:Promise.resolve({category_id:'pcat_hats',size:['42,5','50'],color:['black','white'],sort:'price_asc',page:'2'})}
 for(const action of [catalogPage().default,catalogPage().generateMetadata]) {
  await assert.rejects(action(props),error=>{
   assert.equal(error.message,'REDIRECT')
   const target=new URL(error.location,'https://tamir.rs')
   assert.equal(target.pathname,'/rs/catalog/hats')
   assert.equal(target.searchParams.has('category_id'),false)
   assert.deepEqual(target.searchParams.getAll('size'),['42,5','50'])
   assert.deepEqual(target.searchParams.getAll('color'),['black','white'])
   assert.equal(target.searchParams.get('page'),'2')
   assert.equal(target.searchParams.get('sort'),'price_asc')
   return true
  })
 }
})
test('new category handles resolve to the internal category ID and keep the active menu selection',async()=>{
 const page=catalogPage({category:{id:'pcat_new',name:'Jackets',handle:'winter-jackets'}})
 const tree=await page.default({params:Promise.resolve({countryCode:'rs',categoryHandle:'winter-jackets'}),searchParams:Promise.resolve({size:'50'})})
 assert.equal(tree.props.activeCategoryId,'pcat_new')
 const client=find(tree,node=>node.type==='CatalogClient')
 assert.equal(client.props.selection.category_id,'pcat_new')
 assert.equal(client.props.selection.size[0],'50')
 assert.equal(client.props.basePath,'/rs/catalog/winter-jackets')
})
test('category handles are encoded as a single path segment and an ID query cannot override the path category',async()=>{
 assert.equal(categoryPath({id:'id',handle:'Šalovi & kape'}),'/rs/catalog/%C5%A0alovi%20%26%20kape')
 await assert.rejects(catalogPage().default({params:Promise.resolve({countryCode:'rs',categoryHandle:'hats'}),searchParams:Promise.resolve({category_id:'another',q:'cap'})}),error=>error.location==='/rs/catalog/hats?q=cap')
})
