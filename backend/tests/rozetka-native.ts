/** Run only against a disposable database named *_import_test after `medusa db:migrate`. */
import assert from 'node:assert/strict'
import type { ExecArgs } from '@medusajs/framework/types'
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils'
import { executeImport, previewImport } from '../src/utils/rozetka-admin'
import { parseFeed } from '../src/utils/rozetka-preview'
import { initialDraft } from '../src/shared/rozetka-import'

export default async function testNativeImport({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.match(url.pathname, /_import_test$/, 'This integration test requires a disposable *_import_test database')
  const product = container.resolve(Modules.PRODUCT)
  const category = await product.createProductCategories({name:'Import test category',handle:`import-test-${Date.now()}`,is_active:true,is_internal:false})
  const stock = await container.resolve(Modules.STOCK_LOCATION).createStockLocations({name:'Import test warehouse'})
  const channel = await container.resolve(Modules.SALES_CHANNEL).createSalesChannels({name:'Import test channel'})
  const fulfillment = container.resolve(Modules.FULFILLMENT)
  if (!(await fulfillment.listShippingProfiles({type:'default'})).length) await fulfillment.createShippingProfiles({name:'Default test',type:'default'})
  const locales = container.resolve(Modules.TRANSLATION)
  for (const code of ['en','sr-RS']) {
    if (!(await locales.listLocales({code})).length) await locales.createLocales({code,name:code})
  }
  const unique = Date.now()
  const xml = `<yml_catalog><shop><categories><category id="8">Hats</category></categories><offers><offer id="test-${unique}-s"><url>https://tamir.ua/native-${unique}.html</url><name>Test hat</name><price>100</price><currencyId>UAH</currencyId><categoryId>8</categoryId><stock_quantity>9</stock_quantity><param name="Size">S</param><picture>https://tamir.ua/images/test.jpg</picture></offer><offer id="test-${unique}-m"><url>https://tamir.ua/native-${unique}.html</url><name>Test hat</name><price>110</price><currencyId>UAH</currencyId><categoryId>8</categoryId><stock_quantity>10</stock_quantity><param name="Size">M</param></offer></offers></shop></yml_catalog>`
  const source = parseFeed(xml).products[0], draft = initialDraft(source)
  draft.category_id=category.id;draft.title_sr='Test kapa';draft.title_en='Test hat';draft.variants[0].price='1500,50';draft.variants[0].stock='3';draft.variants[1].selected=false
  const body={draft,settings:{stock_location_id:stock.id,sales_channel_id:channel.id,image_mode:'remote' as const}}
  const original=global.fetch
  global.fetch=async()=>new Response(xml)
  try {
    const preview=await previewImport(container,true)
    assert.equal(preview.categories.find(c=>c.id===category.id)?.name,'Import test category')
    const first=await executeImport(container,body,'integration-test')
    const query=container.resolve(ContainerRegistrationKeys.QUERY)
    const {data: products}=await query.graph({entity:'product',fields:['id','title','status','categories.id','variants.id','variants.sku','variants.price_set.prices.*','variants.inventory_items.inventory_item_id'],filters:{id:first.product_id}}, {locale:'sr-RS'})
    assert.equal(products[0].title,'Test kapa');assert.equal(products[0].status,'draft');assert.equal(products[0].variants?.length,1)
    const variant=products[0].variants![0]!
    assert.equal(Number(variant.price_set?.prices?.[0]?.amount),1500.5)
    const itemId=variant.inventory_items?.[0]?.inventory_item_id
    const levels=await container.resolve(Modules.INVENTORY).listInventoryLevels({inventory_item_id:itemId!,location_id:stock.id})
    assert.equal(Number(levels[0].stocked_quantity),3)
    assert.equal((await executeImport(container,body,'integration-test')).action,'replayed')
    const stored=await product.retrieveProduct(first.product_id)
    draft.mode='update';draft.existing_id=first.product_id;draft.existing_updated_at=new Date(stored.updated_at).toISOString();draft.variants[0].price='1700';draft.variants[0].stock='4'
    await executeImport(container,body,'integration-test')
    const {data: changed}=await query.graph({entity:'product_variant',fields:['id','price_set.prices.*'],filters:{id:variant.id}})
    assert.equal(Number(changed[0].price_set?.prices?.[0]?.amount),1700)
    assert.equal((await product.retrieveProduct(first.product_id,{relations:['variants']})).variants.length,1)
    console.log('ROZETKA_NATIVE_INTEGRATION_OK: real workflows, translations, RSD prices, inventory, replay and update verified')
  } finally {global.fetch=original}
}
