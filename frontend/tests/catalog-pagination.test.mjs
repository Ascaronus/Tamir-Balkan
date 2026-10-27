import test from 'node:test'
import assert from 'node:assert/strict'
import { load, hooks, find } from '../test-support/component-harness.mjs'
function setup(fetchCatalog) {
 const h=hooks(); let customer=null
 const props={initial:{products:[{id:'p1'}],count:49},selection:{page:1,sort:'newest',size:[],color:[]},regionId:'rs',title:'Catalog',summaries:{}}
 const {CatalogClient}=load('frontend/src/components/store/CatalogClient.tsx',{
  react:{...h.react,useTransition:()=>[false,fn=>fn()]},'@/components/i18n/LocalizedLink':'Link',
  '@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({push(){}})},
  '@/components/auth/AuthProvider':{useAuth:()=>({customer,isReady:true})},
  '@/components/i18n/LocaleProvider':{useLocaleContext:()=>({locale:'en',t:k=>k})},
  '@/lib/store/catalog':{catalogSorts:['newest'],catalogHref:s=>`?page=${s.page}`,fetchCatalog},
  '@/lib/reviews/server':{reviewSummaries:async()=>({})},'./ProductCard':{ProductCard:'ProductCard'},'./CatalogFilters':{CatalogFilters:'Filters'},'./DesignIcon':{DesignIcon:'Icon'},
 },{AbortController})
 return {h,render:()=>h.render(()=>CatalogClient(props)),signIn(){customer={id:'customer'}},more:tree=>find(tree,n=>n.props?.className==='button-secondary catalog-load-more'),products:tree=>Array.from(find(tree,n=>n.type==='ul').props.children,n=>n.props.product.id)}
}
test('load more appends unique products, guards duplicate clicks and advances one page',async()=>{
 let resolve,calls=0,page
 const s=setup(selection=>{calls++;page=selection.page;return new Promise(r=>{resolve=r})})
 let tree=s.render();s.more(tree).props.onClick();s.more(tree).props.onClick()
 assert.equal(calls,1);assert.equal(page,2);tree=s.render();assert.equal(s.more(tree).props.disabled,true)
 resolve({products:[{id:'p1'},{id:'p2'}],count:49});await s.h.flush();tree=s.render()
 assert.deepEqual(s.products(tree),['p1','p2']);s.more(tree).props.onClick();assert.equal(page,3)
 resolve({products:[{id:'p3'}],count:49});await s.h.flush();tree=s.render()
 assert.equal(s.more(tree),null);assert.deepEqual(s.products(tree),['p1','p2','p3'])
})
test('failed load more retains products and retries the same page',async()=>{
 const requested=[];const s=setup(async selection=>{requested.push(selection.page);if(requested.length===1)throw Error('offline');return {products:[{id:'p2'}],count:49}})
 let tree=s.render();s.more(tree).props.onClick();await s.h.flush();tree=s.render()
 assert.deepEqual(s.products(tree),['p1']);assert.equal(s.more(tree).props.children,'common.retry')
 s.more(tree).props.onClick();await s.h.flush();tree=s.render();assert.deepEqual(requested,[2,2]);assert.deepEqual(s.products(tree),['p1','p2'])
})
test('account changes hide appended products from the previous pricing context',async()=>{
 const s=setup(async()=>({products:[{id:'p2'}],count:49}))
 let tree=s.render();s.more(tree).props.onClick();await s.h.flush();tree=s.render();assert.deepEqual(s.products(tree),['p1','p2'])
 s.signIn();tree=s.render();assert.deepEqual(s.products(tree),['p1'])
})
