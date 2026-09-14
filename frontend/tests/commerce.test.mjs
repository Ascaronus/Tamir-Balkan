import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stockLimit, canPurchase, stableItems, requireQuantity } from '../src/lib/store/commerce.ts'
import { formatMoney } from '../src/lib/format-money.ts'
import { getImagesForVariant, normalizeImageUrl } from '../src/lib/product-image.ts'
import { localizedText } from '../src/lib/i18n/content.ts'
import { offerSize, offerStock, offerPictures, offerPriceRsd } from '../../backend/src/utils/rozetka.ts'

test('inventory respects managed stock, unknown stock, backorders, and missing prices', () => {
  assert.equal(stockLimit({manage_inventory:true, inventory_quantity:0}),0)
  assert.equal(stockLimit({manage_inventory:true}),0)
  assert.equal(stockLimit({manage_inventory:true, inventory_quantity:-3}),0)
  assert.equal(stockLimit({manage_inventory:false}),null)
  assert.equal(stockLimit({manage_inventory:true,allow_backorder:true}),null)
  assert.equal(canPurchase({manage_inventory:true,inventory_quantity:3,calculated_price:{calculated_amount:1200}}),true)
  assert.equal(canPurchase({manage_inventory:true,inventory_quantity:0,calculated_price:{calculated_amount:1200}}),false)
  assert.equal(canPurchase({manage_inventory:false,calculated_price:null}),false)
})
test('cart rows stay put when the API reorders the updated item', () => {
  const previous=[{id:'a'},{id:'b'},{id:'c'}]
  assert.deepEqual(stableItems([{id:'c'},{id:'a'},{id:'b'}],previous).map(x=>x.id),['a','b','c'])
  assert.deepEqual(stableItems([{id:'d'},{id:'c'},{id:'a'}],previous).map(x=>x.id),['a','c','d'])
  assert.deepEqual(stableItems([{id:'c',created_at:'2026-02-01'},{id:'a',created_at:'2026-01-01'}]).map(x=>x.id),['a','c'])
})
test('invalid quantities are refused',()=>{
  for(const value of [0,-1,1.5,NaN,Infinity]) assert.throws(()=>requireQuantity(value))
  assert.doesNotThrow(()=>requireQuantity(2))
})
test('v2 prices are never divided by 100',()=>{
  assert.match(formatMoney(12.5,'eur','en-GB'),/12\.50/)
  assert.match(formatMoney(1200.25,'rsd','en-GB'),/1,200\.25/)
  assert.equal(formatMoney(Infinity,'rsd'),'—')
})
test('gallery retains all product photos and prioritizes explicit variant photos',()=>{
  const product={images:[{id:'a',url:'https://tamir.ua/a.jpg'},{id:'b',url:'https://tamir.ua/b.jpg'}],thumbnail:'https://tamir.ua/a.jpg',variants:[{id:'v',images:[{id:'b',url:'https://tamir.ua/b.jpg'},{id:'c',url:'https://tamir.ua/c.jpg'}]}]}
  assert.deepEqual(getImagesForVariant(product,'v').map(x=>x.id),['b','c','a'])
  assert.equal(normalizeImageUrl('javascript:alert(1)'),undefined)
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL='http://178.104.108.200:9000'
  assert.equal(normalizeImageUrl('http://localhost:9000/static/a.jpg'),'http://178.104.108.200:9000/static/a.jpg')
})
test('category translations support metadata and existing English menu names',()=>{
  assert.equal(localizedText({metadata:{i18n:{sr:{name:'Košulje'}}}},'name','Shirts','sr'),'Košulje')
  assert.equal(localizedText({},'name',' Turtleneck','sr'),'Rolka')
  assert.equal(localizedText({},'name','Custom','en'),'Custom')
})
test('EN/SR dictionaries have identical keys and no Montenegro',()=>{
  const en=JSON.parse(readFileSync(new URL('../src/messages/en.json',import.meta.url)))
  const sr=JSON.parse(readFileSync(new URL('../src/messages/sr.json',import.meta.url)))
  const keys=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'?keys(v,p+k+'.'):[p+k]).sort()
  assert.deepEqual(keys(en),keys(sr))
  assert.equal(en.countries.me,undefined)
  assert.equal(sr.countries.me,undefined)
})
test('feed supports Ukrainian size names and collects pictures across every offer',()=>{
  assert.equal(offerSize({param:{name:'Розмір','#text':'048'}}),'048')
  assert.equal(offerSize({}),'One size')
  assert.deepEqual(offerPictures([{picture:['a','b']},{picture:['b','c']}]),['a','b','c'])
})
test('unavailable and missing-stock feed offers never invent inventory',()=>{
  assert.equal(offerStock({available:false,stock_quantity:20}),0)
  assert.equal(offerStock({available:'true'}),0)
  assert.equal(offerStock({stock_quantity:'3'}),3)
})
test('import conversion validates currency and rate, preserving major units',()=>{
  assert.equal(offerPriceRsd({id:'1',price:'1 000,5',currencyId:'UAH'},2.5),2501.25)
  assert.equal(offerPriceRsd({id:'1',price:'1200',currencyId:'RSD'},2.5),1200)
  assert.throws(()=>offerPriceRsd({id:'1',price:'bad'},2))
  assert.throws(()=>offerPriceRsd({id:'1',price:100,currencyId:'EUR'},2))
})
