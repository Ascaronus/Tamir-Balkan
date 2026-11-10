import test from 'node:test'
import assert from 'node:assert/strict'
import { load, hooks, find } from '../test-support/component-harness.mjs'
import * as paths from '../src/lib/i18n/paths.ts'
import * as config from '../src/lib/i18n/config.ts'
import { languageAlternates, siteUrl, hostBlocksSearchEngines, ROBOTS_NOINDEX_TAG } from '../src/lib/seo.ts'

const response = {
 redirect: (url, status) => ({url:String(url),status,headers:new Headers()}),
 rewrite: (url, options) => ({rewrite:String(url),...options}),
 next: options => ({next:true,headers:new Headers(),...options}),
}
const {proxy, config: proxyConfig}=load('frontend/src/proxy.ts',{'next/server':{NextResponse:response},'./lib/i18n/config':config,'./lib/i18n/paths':paths,'./lib/seo':{hostBlocksSearchEngines,ROBOTS_NOINDEX_TAG}},{Headers})
function request(path, language, cookie, host='tamir.rs') {
 const url=new URL(path,`https://${host}`);url.clone=()=>{const copy=new URL(url);copy.clone=url.clone;return copy}
 return {nextUrl:url,headers:new Headers({'accept-language':language||'', 'x-tamir-locale':'en'}),cookies:{get:()=>cookie?{value:cookie}:undefined}}
}
test('every host that is not a public production origin is closed to search engines, entry redirects included',()=>{
 for(const host of ['test.tamir.rs','test-api.tamir.rs','192.168.1.143','tamir-staging.local']) {
  for(const path of ['/','/rs','/rs/catalog','/en/privacy']) {
   const result=proxy(request(path,'en',undefined,host))
   assert.match(result.headers.get('x-robots-tag'),/noindex/,`${host}${path}`)
  }
 }
 for(const host of ['tamir.rs','www.tamir.rs'])
  for(const path of ['/','/rs','/rs/catalog/hats'])
   assert.equal(proxy(request(path,'en',undefined,host)).headers.get('x-robots-tag'),null,`${host}${path}`)
 // The metadata routes answer without the proxy, so they must not be matched.
 for(const path of ['/robots.txt','/sitemap.xml','/api/store/x','/_next/static/x.js','/favicon.ico'])
  assert.equal(new RegExp(`^(?:${proxyConfig.matcher[0]})$`).test(path),false,path)
 assert.equal(new RegExp(`^(?:${proxyConfig.matcher[0]})$`).test('/rs/catalog'),true)
})
test('root permanently redirects to the Serbian canonical regardless of browser or saved language',()=>{
 for(const browser of ['en','en-GB,en;q=0.8','en-US','ru-RU,ru;q=0.9,en;q=0.8','de-DE','sr-Latn-RS','']) {
  for(const cookie of [undefined,'sr','en','invalid']) {
   const result=proxy(request('/?q=hat&size=42%2C5',browser,cookie))
   assert.equal(result.status,308)
   assert.equal(result.url,'https://tamir.rs/rs?q=hat&size=42%2C5')
   assert.match(result.headers.get('cache-control'),/no-store/)
   assert.equal(result.headers.get('vary'),null)
  }
 }
})
test('explicit links override cookies and browser without rewriting away the language',()=>{
 const sr=proxy(request('/rs/catalog/hats','en','en'));assert.equal(sr.next,true);assert.equal(sr.request.headers.get('x-tamir-locale'),'sr')
 const en=proxy(request('/en/catalog/hats?size=42%2C5&color=black&page=2','ru','sr'))
 assert.equal(en.next,true);assert.equal(en.rewrite,undefined);assert.equal(en.request.headers.get('x-tamir-locale'),'en')
 for(const page of ['privacy','terms','cookies'])assert.equal(proxy(request('/en/'+page)).request.headers.get('x-tamir-locale'),'en')
 assert.equal(proxy(request('/en')).next,true)
 assert.equal(proxy(request('/en/api/locale')).next,true)
})
test('entry redirect removes the reverse proxy internal port but preserves an explicit public port',()=>{
 for (const host of ['tamir.rs','tamir.rs:8443']) {
  const req=request('/?q=hat','en')
  req.nextUrl=new URL('https://localhost:3000/?q=hat')
  req.headers.set('host',host)
  assert.equal(proxy(req).url,`https://${host}/rs?q=hat`)
 }
})
test('localized navigation preserves filters, variants and fragments, leaving APIs and external links untouched',()=>{
 assert.equal(paths.localizedPath('/rs/catalog/hats?size=42%2C5&page=2#list','en'),'/en/catalog/hats?size=42%2C5&page=2#list')
 assert.equal(paths.localizedPath('/en/account/login?next=checkout','sr'),'/rs/nalog/prijava?next=checkout')
 assert.equal(paths.localizedPath('/en','sr'),'/rs')
 for(const url of ['/api/locale','//example.org','https://example.org','#reviews','mailto:help@tamir.rs'])assert.equal(paths.localizedPath(url,'en'),url)
 const product={handle:'bordo-kapa',metadata:{en_handle:'burgundy-hat',en_content_ready:true}}
 assert.equal(paths.productPath(product,'sr'),'/rs/products/bordo-kapa');assert.equal(paths.productPath(product,'en'),'/en/products/burgundy-hat')
 assert.equal(paths.englishReady(product),true);assert.equal(paths.englishReady({metadata:{en_handle:'hat'}}),false)
})
test('each language has its own canonical and reciprocal alternatives',()=>{
 const sr='/rs/products/bordo-kapa',en='/en/products/burgundy-hat'
 for(const locale of ['sr','en']) {
  const metadata=languageAlternates(sr,locale,en)
  assert.equal(metadata.canonical,siteUrl(locale==='en'?en:sr))
  assert.deepEqual(metadata.languages,{sr:siteUrl(sr),en:siteUrl(en)})
 }
 assert.equal(languageAlternates('/','en').canonical,siteUrl('/en'))
})
test('client links and router actions actually retain EN while market arguments remain untouched',()=>{
 const context={useLocaleContext:()=>({locale:'en'})}
 const Link=load('frontend/src/components/i18n/LocalizedLink.tsx',{'next/link':'Link','./LocaleProvider':context}).default
 assert.equal(Link({href:'/rs/cart'}).props.href,'/en/cart')
 let destination
 const {useLocalizedRouter}=load('frontend/src/components/i18n/useLocalizedRouter.ts',{'next/navigation':{useRouter:()=>({push:url=>destination=url})},'./LocaleProvider':context})
 useLocalizedRouter().push('/rs/checkout');assert.equal(destination,'/en/checkout')
})
test('switcher remembers selection and requests the same translated product and fragment with scroll preservation',async()=>{
 const h=hooks();let saved,destination
 const {LanguageSwitcher}=load('frontend/src/components/i18n/LanguageSwitcher.tsx',{
  react:{...h.react,useTransition:()=>[false,fn=>fn()]},'./LanguagePaths':{useLanguagePaths:()=>({sr:'/rs/products/kapa',en:'/en/products/hat'})},
  'next/navigation':{usePathname:()=>'/rs/products/kapa',useRouter:()=>({push(){}})},'@/lib/i18n/config':config,
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'sr',t:k=>k})},'@/lib/medusa':{sdk:{client:{setLocale:()=>{}}}},
  '@/lib/i18n/locale-scroll':{navigateWithLocaleScroll:url=>destination=url},
 },{fetch:async(_url,options)=>{saved=JSON.parse(options.body).locale;return {ok:true}},window:{location:{search:'?v_id=variant_1',hash:'#reviews',assign:url=>destination=url}}})
 const tree=h.render(LanguageSwitcher)
 await find(tree,node=>node.type==='button'&&node.props.children==='en').props.onClick()
 assert.equal(saved,'en');assert.equal(destination,'/en/products/hat?v_id=variant_1#reviews')
})

function productPage(locale, ready=true, {resolverStatus, available=true,host='tamir.rs'}={}) {
 const product={id:'p1',handle:'bordo-kapa',title:locale==='en'?'Burgundy hat':'Bordo kapa',description:'Description',metadata:{en_handle:'burgundy-hat',en_content_ready:ready},variants:[{id:'variant_1'}]}
 return load('frontend/src/app/[countryCode]/products/[handle]/page.tsx',{
  '@/lib/store/category-url':load('frontend/src/lib/store/category-url.ts'),
  react:{cache:fn=>fn},'@/components/reviews/Stars':{},'@/lib/reviews/server':{productReviews:async()=>null},'@/components/reviews/ProductReviews':{},
  '@/lib/i18n/content':{localizedText:(_p,_key,fallback)=>fallback},'@/lib/product-image':{getImagesForVariant:()=>[]},'@/lib/seo/product':{productJsonLd:()=>null},
  '@/lib/seo':load('frontend/src/lib/seo.ts',{'next/headers':{headers:async()=>new Headers({host,'x-forwarded-proto':'https'})},'./i18n/paths':paths}),'@/components/i18n/LocalizedLink':'Link',
  'next/navigation':{notFound:()=>{throw Error('NOT_FOUND')},permanentRedirect:location=>{throw Object.assign(Error('REDIRECT'),{location})}},
  '@/lib/medusa':{sdk:{client:{fetch:async()=>{if(resolverStatus)throw Object.assign(Error('RESOLVER_FAILURE'),{status:resolverStatus});return {handle:'bordo-kapa'}}}}},
  '@/lib/store/products':{listProductsByCountry:async({handle,countryCode,locale:requested})=>{assert.equal(countryCode,'rs');assert.equal(requested,locale);return {products:available&&handle==='bordo-kapa'?[product]:[],count:1}}},
  '@/components/store/StoreShell':{StoreShell:'StoreShell'},'@/lib/i18n/server':{getTranslations:async()=>({locale,t:k=>k})},
  '@/lib/store/product-delivery':{getProductDelivery:async()=>null},
  '@/components/product/RelatedProducts':{},'@/components/product/ProductDetails':{},
 })
}
test('current translated products retain canonical, alternatives and variant selection without redirects',async()=>{
 const page=productPage('en')
 const props={params:Promise.resolve({countryCode:'en',handle:'burgundy-hat'}),searchParams:Promise.resolve({v_id:'variant_1'})}
 const metadata=await page.generateMetadata(props)
 assert.equal(metadata.alternates.canonical,siteUrl('/en/products/burgundy-hat'));assert.equal(metadata.robots.index,true)
 const tree=await page.default(props);assert.equal(tree.props.countryCode,'rs');assert.equal(tree.props.languagePaths.sr,'/rs/products/bordo-kapa')
 assert.equal(find(tree,node=>node.props?.initialVariantId==='variant_1').props.product.id,'p1')
 await assert.rejects(page.default({...props,params:Promise.resolve({countryCode:'en',handle:'bordo-kapa'})}),/NOT_FOUND/)
 await assert.rejects(productPage('sr').default({...props,params:Promise.resolve({countryCode:'rs',handle:'burgundy-hat'})}),/NOT_FOUND/)
 const sr=productPage('sr');const srProps={...props,params:Promise.resolve({countryCode:'rs',handle:'bordo-kapa'})}
 assert.equal((await sr.generateMetadata(srProps)).alternates.canonical,siteUrl('/rs/products/bordo-kapa'))
 await sr.default(srProps)
 assert.equal((await productPage('en',false).generateMetadata(props)).robots.index,false)
})

test('Serbian service URLs round-trip to English while preserving query and fragment',()=>{
 for(const [en,sr] of [['cart','korpa'],['account','nalog'],['account/login','nalog/prijava'],['account/register','nalog/registracija'],['account/forgot-password','nalog/zaboravljena-lozinka']]) {
  assert.equal(paths.localizedPath(`/en/${en}?next=checkout#form`,'sr'),`/rs/${sr}?next=checkout#form`)
  assert.equal(paths.localizedPath(`/rs/${sr}?next=checkout#form`,'en'),`/en/${en}?next=checkout#form`)
  const legacy=proxy(request(`/rs/${en}?next=checkout`,'en','en'))
  assert.equal(legacy.status,308)
  assert.equal(legacy.url,`https://tamir.rs/rs/${sr}?next=checkout`)
  const current=proxy(request(`/rs/${sr}?next=checkout`,'en','en'))
  assert.equal(current.next,true)
  assert.equal(current.request.headers.get('x-tamir-locale'),'sr')
 }
 for(const path of ['/rs','/en']) assert.equal(proxy(request(path)).next,true)
})

test('old product addresses cannot redirect or publish metadata even if a stale resolver returns a replacement',async()=>{
 for(const locale of ['sr','en']) for(const handle of ['old-hat','old-english-hat','rozetka-0123456789abcdef0123']) {
  const props={params:Promise.resolve({countryCode:locale==='sr'?'rs':'en',handle}),searchParams:Promise.resolve({v_id:'retired_variant'})}
  for(const resolverStatus of [undefined,404]) {
   const page=productPage(locale,true,{resolverStatus})
   await assert.rejects(page.generateMetadata(props),/NOT_FOUND/)
   await assert.rejects(page.default(props),/NOT_FOUND/)
  }
 }
})
test('resolver failures remain failures and an unavailable product is not exposed by its localized URL',async()=>{
 const props={params:Promise.resolve({countryCode:'en',handle:'burgundy-hat'}),searchParams:Promise.resolve({})}
 for(const action of ['generateMetadata','default']) {
  await assert.rejects(productPage('en',true,{resolverStatus:503})[action](props),/RESOLVER_FAILURE/)
  await assert.rejects(productPage('en',true,{available:false})[action](props),/NOT_FOUND/)
 }
})

test('translated product metadata stays noindex on staging',async()=>{
 for(const locale of ['sr','en']) {
  const page=productPage(locale,true,{host:'test.tamir.rs'})
  const metadata=await page.generateMetadata({params:Promise.resolve({countryCode:locale==='sr'?'rs':'en',handle:locale==='sr'?'bordo-kapa':'burgundy-hat'})})
  assert.equal(metadata.robots.index,false)
  assert.equal(metadata.robots.follow,false)
  assert.ok(metadata.alternates.canonical.startsWith('https://tamir.rs/'))
 }
})
