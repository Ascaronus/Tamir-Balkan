import test from 'node:test'
import assert from 'node:assert/strict'
import { reorderTargets, applyReorder } from '../src/lib/cart/reorder.ts'
import { missingSourceInventory } from '../../backend/src/utils/import-scope.ts'
import { normalizeCatalogQuery } from '../src/lib/store/search-params.ts'

test('reorder retry reconciles a lost successful response without duplicates', async () => {
  const cart=[{variant_id:'a',quantity:1}]
  const targets=reorderTargets(cart,[{variant_id:'a',quantity:2},{variant_id:'b',quantity:1}])
  let fail=true
  const steps={items:async()=>cart,add:async(id,quantity)=>{
    const item=cart.find(i=>i.variant_id===id)
    if(item)item.quantity+=quantity;else cart.push({variant_id:id,quantity})
    if(fail){fail=false;throw Error('response lost')}
  }}
  await assert.rejects(applyReorder(targets,steps))
  await applyReorder(targets,steps)
  assert.deepEqual(cart,[{variant_id:'a',quantity:3},{variant_id:'b',quantity:1}])
})
test('reorder validates deleted variants before any mutation',()=>{
  assert.throws(()=>reorderTargets([],[{variant_id:'a',quantity:1},{variant_id:null,quantity:2}]),/UNAVAILABLE/)
})
test('full import only retires missing variants of the exact feed',()=>{
  const variant=(sku,source,id)=>({sku,metadata:{rozetka_feed_source:source},inventory_items:[{inventory_item_id:id}]})
  assert.deepEqual(missingSourceInventory([variant('a','feed','1'),variant('b','feed','2'),variant('c','other','3'),variant('d',undefined,'4')],'feed',new Set(['a'])),['2'])
})
test('catalog normalizes arrays, whitespace and invalid pages',()=>{
  assert.deepEqual(normalizeCatalogQuery({q:[' x ','y'],category_id:['c','d'],page:'-5'}),{q:'x',category_id:'c',page:'1'})
})
test('full feed never zeroes an inventory item shared with another source',()=>{
 const shared={inventory_item_id:'shared'}
 assert.deepEqual(missingSourceInventory([
  {sku:'old',metadata:{rozetka_feed_source:'feed'},inventory_items:[shared]},
  {sku:'manual',inventory_items:[shared]},
 ],'feed',new Set()),[])
})
