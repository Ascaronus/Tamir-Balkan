import test from 'node:test'
import assert from 'node:assert/strict'
import {load} from '../test-support/component-harness.mjs'
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
