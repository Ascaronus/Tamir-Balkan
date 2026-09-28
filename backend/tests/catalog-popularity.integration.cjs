const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { popularityQuery } = require('../src/utils/catalog-popularity')
const knex = require('knex')
const schema = `tamir_catalog_test_${process.pid}`
const connection = process.env.TEST_REVIEWS_DB_URL
const wasmPath = process.env.CATALOG_TEST_PGLITE_PATH
if (!connection && !wasmPath) throw Error('Use an isolated TEST_REVIEWS_DB_URL (never DATABASE_URL) or CATALOG_TEST_PGLITE_PATH')
const db = knex({ client: 'pg', ...(connection ? { connection, searchPath: [schema] } : {}) })
let wasm, root
async function execute(query) {
  if (!wasm) return await query
  const native = query.toSQL().toNative()
  return (await wasm.query(native.sql, native.bindings)).rows
}
before(async () => {
  if (wasmPath) {
    const { PGlite } = require(wasmPath)
    wasm = new PGlite()
    await wasm.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
  } else {
    root = knex({ client: 'pg', connection })
    await root.raw(`CREATE SCHEMA ${schema}`)
  }
  await execute(db.raw(`CREATE TABLE "order" (id text PRIMARY KEY, version integer DEFAULT 1, status text DEFAULT 'completed',
    is_draft_order boolean DEFAULT false, region_id text DEFAULT 'reg_rs', sales_channel_id text DEFAULT 'sc_store',
    deleted_at timestamptz, canceled_at timestamptz)`))
  await execute(db.raw('CREATE TABLE order_line_item (id text PRIMARY KEY, product_id text, deleted_at timestamptz)'))
  await execute(db.raw(`CREATE TABLE order_item (id text PRIMARY KEY, order_id text, item_id text, version integer DEFAULT 1,
    quantity numeric, return_received_quantity numeric DEFAULT 0, written_off_quantity numeric DEFAULT 0, deleted_at timestamptz)`))
  const add = async (id, product, quantity, order = {}, item = {}, line = {}) => {
    await execute(db('order').insert({ id, ...order }))
    await execute(db('order_line_item').insert({ id, product_id: product, ...line }))
    await execute(db('order_item').insert({ id, order_id: id, item_id: id, quantity, ...item }))
  }
  await add('sale', 'a', 10, { version: 2 }, { version: 2, return_received_quantity: 2, written_off_quantity: 1 })
  await execute(db('order_item').insert({ id: 'old_version', order_id: 'sale', item_id: 'sale', version: 1, quantity: 999 }))
  await add('other_sale', 'a', 2)
  await add('best', 'b', 12)
  await add('returned', 'b', 3, {}, { return_received_quantity: 4 })
  await add('pending', 'a', 500, { status: 'pending' })
  await add('canceled', 'a', 500, { status: 'canceled' })
  await add('canceled_date', 'a', 500, { canceled_at: new Date() })
  await add('draft', 'a', 500, { is_draft_order: true })
  await add('foreign_channel', 'a', 500, { sales_channel_id: 'sc_other' })
  await add('foreign_region', 'a', 500, { region_id: 'reg_other' })
  await add('deleted_order', 'a', 500, { deleted_at: new Date() })
  await add('deleted_item', 'a', 500, {}, { deleted_at: new Date() })
  await add('deleted_line', 'a', 500, {}, {}, { deleted_at: new Date() })
  await add('not_candidate', 'secret', 500)
})
after(async () => {
  await db.destroy()
  if (wasm) await wasm.close()
  if (root) { await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await root.destroy() }
})
test('PostgreSQL popularity counts net completed sales once, ignoring old versions, deleted/draft/canceled/foreign orders', async () => {
  const rows = await execute(popularityQuery(db, ['a', 'b'], ['sc_store'], 'reg_rs'))
  assert.deepEqual(rows.map(row => ({ product_id: row.product_id, sold_units: Number(row.sold_units) })).sort((a, b) => a.product_id.localeCompare(b.product_id)),
    [{ product_id: 'a', sold_units: 9 }, { product_id: 'b', sold_units: 12 }])
})
test('empty scopes and bound SQL-like IDs cannot expose other catalog sales', async () => {
  assert.deepEqual(await execute(popularityQuery(db, ['a'], [], 'reg_rs')), [])
  assert.deepEqual(await execute(popularityQuery(db, [], ['sc_store'], 'reg_rs')), [])
  assert.deepEqual(await execute(popularityQuery(db, ["a' OR 1=1 --"], ['sc_store'], 'reg_rs')), [])
})
