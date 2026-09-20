import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load, hooks, find } from '../test-support/component-harness.mjs'

function browser(initial='') {
 const jar=new Map(initial.split(';').filter(Boolean).map(x=>x.trim().split('=')))
 const scripts=new Map(), events=new Map(), writes=[]
 let reloads=0
 const location={hostname:'tamir.rs',protocol:'https:',reload(){reloads++}}
 const document={
  get cookie(){return [...jar].map(([k,v])=>`${k}=${v}`).join('; ')},
  set cookie(value){writes.push(value);const [pair]=value.split(';');const [k,v]=pair.split('=');if(value.includes('Max-Age=0'))jar.delete(k);else jar.set(k,v)},
  getElementById:id=>scripts.get(id),
  createElement:()=>({remove(){scripts.delete(this.id)}}),
  head:{appendChild:s=>scripts.set(s.id,s)},
  addEventListener(){},removeEventListener(){},visibilityState:'visible',activeElement:null,
 }
 const window={location,addEventListener:(k,v)=>events.set(k,v),removeEventListener(){},setInterval(){return 1},clearInterval(){}}
 const globals={window,document,location,localStorage:{setItem(){}},requestAnimationFrame:fn=>fn()}
 const consent=load('frontend/src/lib/privacy/consent.ts',{},globals)
 return {consent,document,window,scripts,writes,events,globals,get reloads(){return reloads}}
}
test('missing, rejected, corrupt and unrelated consent never loads Google',()=>{
 for(const cookie of ['', 'tamir_consent_v1=rejected','tamir_consent_v1=true','other=accepted']) {
  const b=browser(cookie)
  assert.equal(b.consent.startAnalytics(),false)
  assert.equal(b.scripts.size,0)
  assert.equal(b.window.dataLayer,undefined)
 }
})
test('acceptance loads exactly one tag, with advertising disabled',()=>{
 const b=browser()
 assert.equal(b.consent.saveConsent('accepted'),true)
 assert.ok(b.writes[0].includes('Secure'))
 b.consent.startAnalytics();b.consent.startAnalytics()
 assert.equal(b.scripts.size,1)
 const commands=b.window.dataLayer.map(args=>Array.from(args))
 assert.equal(commands[0][2].analytics_storage,'denied')
 assert.equal(commands[0][2].ad_storage,'denied')
 assert.equal(commands[1][2].analytics_storage,'granted')
 assert.equal(commands[3][2].allow_google_signals,false)
})
test('withdrawal disables analytics and clears GA cookies without deleting cart or language',()=>{
 const b=browser('tamir_consent_v1=accepted; _ga=old; _ga_0L34ZN3ZB6=old; store_locale=en; session=keep')
 b.consent.startAnalytics()
 b.consent.saveConsent('rejected');b.consent.stopAnalytics()
 assert.equal(b.scripts.size,0)
 assert.equal(b.window['ga-disable-G-0L34ZN3ZB6'],true)
 assert.equal(b.consent.readConsent(b.document.cookie),'rejected')
 assert.ok(b.document.cookie.includes('store_locale=en'))
 assert.ok(b.document.cookie.includes('session=keep'))
 assert.ok(!b.document.cookie.includes('_ga'))
 assert.ok(b.writes.some(w=>w.includes('Domain=tamir.rs')))
 assert.equal(b.consent.startAnalytics(),false)
})
test('blocked cookie storage cannot enable analytics',()=>{
 const b=browser()
 Object.defineProperty(b.document,'cookie',{get:()=>'',set:()=>{throw Error('blocked')}})
 assert.equal(b.consent.saveConsent('accepted'),false)
 assert.equal(b.consent.startAnalytics(),false)
})
function ui(b){
 const h=hooks()
 const c=load('frontend/src/components/privacy/CookieConsent.tsx',{
  react:h.react,'next/link':'Link','@/components/i18n/LocaleProvider':{useTranslations:()=>k=>k},'@/lib/privacy/consent':b.consent,
 },b.globals)
 return {h,render:()=>h.render(()=>c.CookieConsent())}
}
test('first visit offers equal accept/reject actions; rejection persists without loading tag',async()=>{
 const b=browser(),{h,render}=ui(b)
 render();await h.flush();let tree=render()
 const reject=find(tree,n=>n.type==='button'&&n.props.children==='cookies.reject')
 const accept=find(tree,n=>n.type==='button'&&n.props.children==='cookies.accept')
 assert.equal(reject.props.className,accept.props.className)
 reject.props.onClick()
 assert.equal(render(),null)
 assert.equal(b.consent.readConsent(b.document.cookie),'rejected')
 assert.equal(b.scripts.size,0)
})
test('saved acceptance can be reopened and withdrawn, removing executed analytics via reload',async()=>{
 const b=browser('tamir_consent_v1=accepted'),{h,render}=ui(b)
 render();await h.flush();assert.equal(render(),null)
 b.events.get('tamir:cookie-settings')()
 find(render(),n=>n.type==='button'&&n.props.children==='cookies.reject').props.onClick()
 assert.equal(b.reloads,1)
 assert.equal(b.consent.readConsent(b.document.cookie),'rejected')
 assert.equal(b.scripts.size,0)
})
test('withdrawal in another tab stops analytics in this tab',async()=>{
 const b=browser('tamir_consent_v1=accepted'),{h,render}=ui(b)
 render();await h.flush()
 b.consent.saveConsent('rejected')
 b.events.get('storage')({key:'tamir_consent_sync'})
 assert.equal(b.reloads,1)
 assert.equal(b.scripts.size,0)
})
test('root layout cannot load a second unconditional Google tag',()=>{
 const text=readFileSync(new URL('../src/app/layout.tsx',import.meta.url),'utf8')
 assert.ok(!text.includes('googletagmanager.com'))
 assert.ok(!text.includes("gtag("))
 assert.equal(text.split('<CookieConsent />').length-1,1)
})
test('incomplete seller details cannot publish final terms',()=>{
 const m=load('frontend/src/lib/legal/seller.ts',{}, {process:{env:{TAMIR_TERMS_PUBLISHED:'true'}}})
 assert.equal(m.getSeller().published,false)
})
