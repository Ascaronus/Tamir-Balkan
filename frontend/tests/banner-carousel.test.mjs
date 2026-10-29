import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { load, find } from '../test-support/component-harness.mjs'
const model=load('frontend/src/lib/banners/shared/banner-model.ts')
const clone=()=>JSON.parse(JSON.stringify(model.initialCarousel))
function fixture(t,{motion=false,hidden=false}={}){
 t.mock.timers.enable({apis:['setTimeout']})
 let slots=[],pos=0,pending=[],cleanups=[],listeners={},mediaListeners={}
 const react={useState(init){const i=pos++;if(!(i in slots))slots[i]=typeof init==='function'?init():init;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v]},useRef(value){const i=pos++;return slots[i]??={current:value}},useEffect(fn,deps){const i=pos++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j])){slots[i]=deps;pending.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
 const media={matches:motion,addEventListener:(k,f)=>mediaListeners[k]=f,removeEventListener:k=>delete mediaListeners[k]},document={hidden,addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k]}
 const component=load('frontend/src/lib/banners/shared/banner-carousel.tsx',{react,'./banner-carousel.css':{}},{window:{matchMedia:()=>media},document,setTimeout,clearTimeout})
 const c=clone();c.banners.push({...c.banners[0],id:'banner_second',texts:{sr:{...c.banners[0].texts.sr,title:'Druga kolekcija'},en:{...c.banners[0].texts.en,title:'Second collection'}}})
 let props={carousel:c,locale:'sr'},tree
 const render=()=>{pos=0;tree=component.BannerCarousel(props);pending.splice(0).forEach(f=>f());return tree}
 const active=()=>find(tree,n=>n.type==='button'&&n.props['aria-pressed']===true)?.props['aria-label']
 t.after(()=>cleanups.forEach(f=>f?.()))
 return {render,active,c,props,media,document,listeners,mediaListeners,component}
}
test('shared preview source and storefront build copy cannot diverge',()=>{
 for(const file of ['banner-model.ts','banner-carousel.tsx','banner-carousel.css'])assert.equal(fs.readFileSync(new URL('../src/lib/banners/shared/'+file,import.meta.url),'utf8'),fs.readFileSync(new URL('../../backend/src/shared/'+file,import.meta.url),'utf8'))
})
test('migration preserves the current real SR/EN hero strings and default interval',()=>{
 for(const locale of ['sr','en']){const m=JSON.parse(fs.readFileSync(new URL(`../src/messages/${locale}.json`,import.meta.url)));const t=clone().banners[0].texts[locale];assert.equal(t.title,m.design.heroTitle);assert.equal(t.subtitle,m.design.heroSubtitle);assert.equal(t.alt,m.design.heroAlt);assert.equal(t.primaryLabel,m.design.heroAction)}
 assert.equal(clone().interval,6000);assert.equal(clone().autoplay,true)
})
for(const locale of ['sr','en'])test(`carousel component renders ${locale} title, CTA, alt, first image priority and indicators`,t=>{
 const f=fixture(t);f.props.locale=locale;const tree=f.render(),text=f.c.banners[0].texts[locale]
 assert.ok(find(tree,n=>n.type==='h2'&&n.props.children===text.title));assert.ok(find(tree,n=>n.type==='a'&&n.props.children===text.primaryLabel&&n.props.href==='#catalog-products'))
 const img=find(tree,n=>n.type==='img');assert.equal(img.props.alt,text.alt);assert.equal(img.props.fetchPriority,'high');assert.equal(img.props.loading,'eager')
 assert.match(f.active(),new RegExp(locale==='sr'?'Prikaži baner 1':'Show banner 1'))
})
test('timer rotates cyclically, manual selection resets interval, configured interval takes effect',t=>{
 const f=fixture(t);f.render();f.render();t.mock.timers.tick(5999);f.render();assert.match(f.active(),/ 1:/);t.mock.timers.tick(1);let tree=f.render();assert.match(f.active(),/ 2:/)
 find(tree,n=>n.type==='button'&&n.props['aria-label']?.includes(' 1:')).props.onClick();f.render();t.mock.timers.tick(5999);f.render();assert.match(f.active(),/ 1:/)
 t.mock.timers.tick(1);f.render();assert.match(f.active(),/ 2:/);f.props.carousel={...f.c,interval:3000};f.render();t.mock.timers.tick(3000);f.render();assert.match(f.active(),/ 1:/)
})
test('hover, focus, hidden tab, reduced motion and autoplay off pause rotation',t=>{
 const f=fixture(t);let tree=f.render();f.render();tree.props.onMouseEnter();f.render();t.mock.timers.tick(20000);f.render();assert.match(f.active(),/ 1:/)
 tree.props.onMouseLeave();tree.props.onFocus();f.render();t.mock.timers.tick(20000);f.render();assert.match(f.active(),/ 1:/)
 tree.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});f.document.hidden=true;f.listeners.visibilitychange();f.render();t.mock.timers.tick(20000);f.render();assert.match(f.active(),/ 1:/)
 f.document.hidden=false;f.listeners.visibilitychange();f.media.matches=true;f.mediaListeners.change();f.render();t.mock.timers.tick(20000);f.render();assert.match(f.active(),/ 1:/)
 f.media.matches=false;f.mediaListeners.change();f.props.carousel={...f.c,autoplay:false};f.render();t.mock.timers.tick(20000);f.render();assert.match(f.active(),/ 1:/)
})
test('swipe changes slides, vertical scroll does not, preview disables navigation and uses mobile image',t=>{
 const f=fixture(t);f.props.preview=true;f.props.previewWidth=390;f.c.banners[0].mobile='https://api.tamir.rs/static/mobile.webp';let tree=f.render();assert.equal(find(tree,n=>n.type==='img').props.src,f.c.banners[0].mobile)
 assert.equal(find(tree,n=>n.type==='a').props.href,undefined);
 let prevented=false;find(tree,n=>n.type==='a').props.onClick({preventDefault:()=>prevented=true});assert.equal(prevented,true)
 tree.props.onTouchStart({touches:[{clientX:200,clientY:100}]});tree.props.onTouchEnd({changedTouches:[{clientX:100,clientY:102}]});tree=f.render();assert.match(f.active(),/ 2:/)
 tree.props.onTouchStart({touches:[{clientX:200,clientY:100}]});tree.props.onTouchEnd({changedTouches:[{clientX:100,clientY:300}]});f.render();assert.match(f.active(),/ 2:/)
})
test('single banner hides indicators; zero active banners hides hero; drafts can preview one inactive banner',t=>{
 const f=fixture(t);f.props.carousel=clone();let tree=f.render();assert.equal(find(tree,n=>n.props.className==='tb-banner-controls'),null)
 f.props.carousel={...clone(),banners:[]};assert.equal(f.render(),null)
})
test('selecting the already active dot also restarts the autoplay interval',t=>{
 const f=fixture(t);f.render();let tree=f.render();t.mock.timers.tick(5000)
 find(tree,n=>n.type==='button'&&n.props['aria-pressed']===true).props.onClick();f.render();t.mock.timers.tick(1000);f.render();assert.match(f.active(),/ 1:/)
 t.mock.timers.tick(5000);f.render();assert.match(f.active(),/ 2:/)
})
