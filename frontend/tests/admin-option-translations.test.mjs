import test from 'node:test'
import assert from 'node:assert/strict'
import {load} from '../test-support/component-harness.mjs'
const {optionTranslationRows,translationDraft,optionTranslationPayload,cellKey}=load('backend/src/admin/lib/option-translations.ts')
const option={id:'color',title:'Color',translations:[{id:'title-sr',locale_code:'sr-RS',translations:{title:'Boja'}}],values:[{id:'black',value:'Black',translations:[{id:'value-sr',locale_code:'sr-RS',translations:{value:'Crna',other:'keep'}}]}]}
test('editor reads saved native option translations and saves arbitrary labels by option value ID',()=>{
 const rows=optionTranslationRows([option]),baseline=translationDraft(rows)
 assert.equal(baseline[cellKey('black','sr-RS')],'Crna')
 const payload=optionTranslationPayload(rows,baseline,{...baseline,[cellKey('black','sr-RS')]:'Posebna nijansa 2026',[cellKey('black','en')]:'Custom shade'})
 assert.equal(payload.update[0].id,'value-sr');assert.equal(payload.update[0].translations.value,'Posebna nijansa 2026');assert.equal(payload.update[0].translations.other,'keep')
 assert.equal(payload.create[0].reference,'product_option_value');assert.equal(payload.create[0].reference_id,'black');assert.equal(payload.create[0].locale_code,'en')
 assert.equal(payload.create[0].translations.value,'Custom shade');assert.equal(option.values[0].value,'Black')
})
test('editor refuses concurrent changes and deleted options, while clearing affects only the edited translation',()=>{
 const rows=optionTranslationRows([option]),baseline=translationDraft(rows),draft={...baseline,[cellKey('black','sr-RS')]:''}
 const payload=optionTranslationPayload(rows,baseline,draft)
 assert.equal(payload.update[0].translations.value,'');assert.equal(payload.update[0].translations.other,'keep')
 const changed=optionTranslationRows([{...option,values:[{...option.values[0],translations:[{id:'value-sr',locale_code:'sr-RS',translations:{value:'New'}}]}]}])
 assert.throws(()=>optionTranslationPayload(changed,baseline,draft),/TRANSLATION_CHANGED/)
 assert.throws(()=>optionTranslationPayload([],baseline,draft),/OPTION_CHANGED/)
 const unchanged=optionTranslationPayload(rows,baseline,baseline)
 assert.equal(unchanged.create.length+unchanged.update.length,0)
})

test('admin widget loads real rows, posts only edited values and reloads the saved translation',async()=>{
 const {hooks,find}=await import('../test-support/component-harness.mjs')
 const h=hooks(),posts=[]
 let current=structuredClone(option)
 const helpers=load('backend/src/admin/lib/option-translations.ts')
 const widget=load('backend/src/admin/widgets/product-option-translations.tsx',{
  react:h.react,'@medusajs/admin-sdk':{defineWidgetConfig:v=>v},
  '@medusajs/ui':Object.fromEntries(['Button','Checkbox','Container','Heading','Input','Label','Text'].map(n=>[n,n])),
  '../lib/option-translations':helpers,
 },{fetch:async(path,init)=>{
   assert.equal(init.credentials,'include')
   if(init.method==='POST'){
     assert.equal(path,'/admin/translations/batch');const body=JSON.parse(init.body);posts.push(body)
     for(const row of body.update)if(row.id==='value-sr')current.values[0].translations[0].translations=row.translations
     return {ok:true,json:async()=>({updated:body.update})}
   }
   assert.match(path,/^\/admin\/products\/product\?fields=/)
   return {ok:true,json:async()=>({product:{options:[current]}})}
 }})
 const render=()=>h.render(()=>widget.default({data:{id:'product',updated_at:'2026-10-02'}}))
 render();await h.flush();let tree=render()
 assert.equal(find(tree,n=>n.props?.id==='black:sr-RS').props.value,'Crna')
 find(tree,n=>n.props?.id==='black:sr-RS').props.onChange({target:{value:'Ugalj'}})
 tree=render();find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});await h.flush();tree=render()
 assert.equal(posts.length,1);assert.equal(posts[0].update.length,1);assert.equal(posts[0].create.length,0)
 assert.equal(posts[0].update[0].translations.value,'Ugalj');assert.equal(current.values[0].value,'Black')
 assert.equal(find(tree,n=>n.props?.id==='black:sr-RS').props.value,'Ugalj')
})


test('automatic translation fills empty draft cells without saving or replacing manual text',async()=>{
 const {hooks,find}=await import('../test-support/component-harness.mjs'),h=hooks(),posts=[]
 const helpers=load('backend/src/admin/lib/option-translations.ts')
 const widget=load('backend/src/admin/widgets/product-option-translations.tsx',{
  react:h.react,'@medusajs/admin-sdk':{defineWidgetConfig:v=>v},
  '@medusajs/ui':Object.fromEntries(['Button','Checkbox','Container','Heading','Input','Label','Text'].map(n=>[n,n])),
  '../lib/option-translations':helpers,
 },{fetch:async(path,init)=>{
   if(init.method==='POST'){
    posts.push(path);assert.equal(path,'/admin/products/product/option-translations/translate')
    const cells=JSON.parse(init.body).cells;assert.ok(cells.every(cell=>cell.locale==='en'))
    return {ok:true,json:async()=>({values:Object.fromEntries(cells.map(cell=>[cell.id+':'+cell.locale,cell.id==='black'?'Black':'Color']))})}
   }
   return {ok:true,json:async()=>({product:{options:[option]}})}
 }})
 const render=()=>h.render(()=>widget.default({data:{id:'product',updated_at:'2026-10-04'}}))
 render();await h.flush();let tree=render()
 find(tree,n=>n.type==='Button'&&n.props.children==='Автоперевод SR + EN').props.onClick();await h.flush();tree=render()
 assert.equal(find(tree,n=>n.props?.id==='black:sr-RS').props.value,'Crna')
 assert.equal(find(tree,n=>n.props?.id==='black:en').props.value,'Black')
 assert.equal(posts.length,1);assert.ok(!posts.includes('/admin/translations/batch'))
 assert.equal(find(tree,n=>n.type==='Button'&&n.props.children==='Сохранить переводы').props.disabled,false)
 const rows=helpers.optionTranslationRows([option]),draft=helpers.translationDraft(rows)
 assert.equal(helpers.optionAutoTranslationCells(rows,draft).length,2)
 assert.equal(helpers.optionAutoTranslationCells(rows,draft,true).length,4)
})
