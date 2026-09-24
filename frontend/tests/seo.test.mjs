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
 }).default
 const entries=await sitemap()
 assert.deepEqual(Array.from(entries,e=>e.url),['/','/cookies','/privacy','/terms','/rs/products/test-tie'].map(p=>siteUrl(p)))
})
