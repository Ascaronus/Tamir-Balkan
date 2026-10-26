import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {load,hooks} from '../test-support/component-harness.mjs'
import {createTranslator} from '../src/lib/i18n/translator.ts'
const {localizeCatalogFacets}=load('backend/src/utils/catalog-translations.ts')
test('option translations change labels, preserve canonical filter keys and prefer exact locale',async()=>{
 const filters={colors:[{value:'black',label:'Black',count:2},{value:'custom',label:'Custom',count:1}],sizes:[]}
 const products=[{id:'p',variants:[{id:'v',options:[{id:'black',value:'Black'}]}]}]
 const result=await localizeCatalogFacets(filters,products,'sr-RS',{listTranslations:async()=>[
  {reference_id:'black',locale_code:'sr',translations:{value:'Crno'}},
  {reference_id:'black',locale_code:'sr-RS',translations:{value:'Crna'}},
  {reference_id:'black',locale_code:'en',translations:{value:'Black'}},
 ]})
 assert.equal(result.colors[0].label,'Crna');assert.equal(result.colors[0].value,'black');assert.equal(result.colors[0].count,2)
 assert.equal(result.colors[1].label,'Custom');assert.equal(filters.colors[0].label,'Black')
})

// Живые словари сообщений витрины (audit p.57, task 5.1). Ниже закреплены конкретные
// en- и sr-строки: правка copy в frontend/src/messages намеренно валит эти проверки.
const en=JSON.parse(readFileSync(new URL('../src/messages/en.json',import.meta.url),'utf8'))
const sr=JSON.parse(readFileSync(new URL('../src/messages/sr.json',import.meta.url),'utf8'))
const catalog=load('frontend/src/lib/store/catalog.ts',{
 '@/lib/medusa':{sdk:{client:{fetch:async()=>({products:[],count:0})}}},
 '@/lib/i18n/config':{medusaStoreLocale:locale=>locale},
 './search-params':{queryText:value=>(Array.isArray(value)?value[0]:value)?.trim()||''},
})
const copy={
 en:{'sidebar.title':'Catalog','design.color':'Color','design.size':'Size','design.price':'Price','design.from':'From','design.to':'To','design.apply':'Apply filters','design.reset':'Reset filters','design.filters':'Filters','design.noOptions':'No available options','common.close':'Close'},
 sr:{'sidebar.title':'Katalog','design.color':'Boja','design.size':'Veličina','design.price':'Cena','design.from':'Od','design.to':'Do','design.apply':'Primeni filtere','design.reset':'Poništi filtere','design.filters':'Filteri','design.noOptions':'Nema dostupnih opcija','common.close':'Zatvori'},
}
const sorts={
 en:{newest:'Newest',price_asc:'Price: low to high',price_desc:'Price: high to low',popularity:'Popularity'},
 sr:{newest:'Najnovije',price_asc:'Cena: rastuće',price_desc:'Cena: opadajuće',popularity:'Popularnost'},
}
const countCopy={en:'{n} products',sr:'{n} proizvoda'}
const message=(locale,key)=>key.split('.').reduce((node,part)=>node?.[part],{'en':en,'sr':sr}[locale])

function renderFilters(messages,filters,selection){
 const h=hooks()
 const panel=load('frontend/src/components/store/CatalogFilters.tsx',{
  react:h.react,
  '@/lib/dialog-backdrop':{trackDialogBackdropPress(){},dismissDialogFromBackdrop(){}},
  '@/components/i18n/useLocalizedRouter':{useLocalizedRouter:()=>({push(){}})},
  '@/components/i18n/LocaleProvider':{useTranslations:()=>createTranslator(messages)},
  '@/lib/store/catalog':catalog,
  './CategoryNavigation':{CategoryNavigation:()=>null},
  './DesignIcon':{DesignIcon:({name})=>({type:'design-icon',props:{'data-icon':name},key:null})},
 })
 return h.render(()=>panel.CatalogFilters({filters,selection}))
}
// Раскрывает и функциональные компоненты (FilterForm рисуется и в боковой панели, и в ящике).
function nodesOf(tree){
 const out=[]
 const visit=node=>{
  if(Array.isArray(node)){for(const child of node)visit(child);return}
  if(node&&typeof node==='object'){
   out.push(node)
   if(typeof node.type==='function')visit(node.type(node.props))
   else visit(node.props?.children)
  }
 }
 visit(tree)
 return out
}
function textOf(node){
 const parts=[]
 const push=child=>{
  if(Array.isArray(child)){for(const c of child)push(c);return}
  if(typeof child==='string'||typeof child==='number'){parts.push(String(child));return}
  if(child&&typeof child==='object'&&typeof child.type!=='function')push(child.props?.children)
 }
 push(node.props?.children)
 return parts.join('')
}
const all=(tree,predicate)=>nodesOf(tree).filter(predicate)
const emptySelection={category_id:'',q:'',size:[],color:[],min_price:'',max_price:'',sort:'newest',page:1}

test('catalog filter copy is read from the real en and sr message files',()=>{
 for(const locale of ['en','sr'])for(const [key,literal] of Object.entries(copy[locale]))
  assert.equal(message(locale,key),literal,`${locale} ${key}`)
 for(const key of Object.keys(copy.en))assert.notEqual(copy.en[key],copy.sr[key],`${key} differs between en and sr`)
 for(const key of Object.keys(copy.sr))assert.doesNotMatch(copy.sr[key],/[\u0400-\u04FF]/,`${key} is written in Latin script`)
})

test('filter panel renders the same controls with English and Serbian storefront strings',()=>{
 const filters={colors:[{value:'black',label:'Black',count:3}],sizes:[{value:'m',label:'M',count:2}],price:{min:1200,max:8600,currency_code:'rsd'}}
 for(const locale of ['en','sr']){
  const tree=renderFilters({'en':en,'sr':sr}[locale],filters,{...emptySelection})
  const wanted=copy[locale]
  const desktop={type:'h2',className:'filter-heading'}
  assert.deepEqual(all(tree,n=>n.type==='h2'&&n.props.className===desktop.className).map(textOf),Array(2).fill(wanted['sidebar.title']),`${locale} filter heading in the side panel and the drawer`)
  assert.deepEqual(all(tree,n=>n.type==='legend').map(textOf),[wanted['design.color'],wanted['design.size'],`${wanted['design.price']} · RSD`,wanted['design.color'],wanted['design.size'],`${wanted['design.price']} · RSD`],`${locale} fieldset legends`)
  const buttons=all(tree,n=>n.type==='button')
  assert.ok(buttons.some(n=>n.props.type==='submit'&&textOf(n)===wanted['design.apply']),`${locale} submit button`)
  assert.ok(buttons.some(n=>n.props.type==='button'&&textOf(n)===wanted['design.reset']),`${locale} reset button`)
  assert.ok(buttons.some(n=>n.props.className==='icon-button'&&n.props['aria-label']===wanted['common.close']),`${locale} close control`)
  assert.ok(buttons.some(n=>n.props.className==='button-secondary catalog-filter-toggle'&&textOf(n)===wanted['design.filters']),`${locale} mobile filter trigger`)
  assert.deepEqual(all(tree,n=>n.type==='dialog').map(n=>n.props['aria-label']),[wanted['design.filters']],`${locale} dialog label`)
  assert.ok(all(tree,n=>n.type==='label'&&n.props.className==='catalog-color-choice').some(n=>textOf(n).includes('Black')),`${locale} keeps the canonical color option`)
  assert.ok(all(tree,n=>n.type==='label'&&n.props.className==='text-choice').some(n=>textOf(n).includes('M')),`${locale} keeps the canonical size option`)
  assert.equal(all(tree,n=>n.type==='p').length,0,`${locale} has options, so no fallback copy`)
 }
})

test('empty facet lists fall back to the localized no-options copy',()=>{
 const filters={colors:[],sizes:[],price:{min:null,max:null,currency_code:'rsd'}}
 for(const locale of ['en','sr']){
  const tree=renderFilters({'en':en,'sr':sr}[locale],filters,{...emptySelection})
  assert.deepEqual(all(tree,n=>n.type==='p').map(textOf),Array(4).fill(copy[locale]['design.noOptions']),`${locale} no-options copy for colors and sizes, twice`)
 }
})

test('catalog sorts and product counts use the real localized labels',()=>{
 assert.deepEqual([...catalog.catalogSorts],['newest','price_asc','price_desc','popularity'])
 for(const locale of ['en','sr']){
  const t=createTranslator({'en':en,'sr':sr}[locale])
  for(const sort of catalog.catalogSorts)assert.equal(t(`design.sorts.${sort}`),sorts[locale][sort],`${locale} sort ${sort}`)
  assert.equal(t('catalog.count',{n:12}),countCopy[locale].replace('{n}','12'),`${locale} product count`)
 }
})
