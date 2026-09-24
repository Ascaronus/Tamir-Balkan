const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { decimalAttributesSchema } = require('../src/utils/decimal-attributes-schema')
const connection = process.env.TEST_REVIEWS_DB_URL
if (!connection) throw Error('Set TEST_REVIEWS_DB_URL to an isolated test database')
const knex = require('knex'), schema = 'tamir_decimal_test_' + process.pid
const root = knex({ client: 'pg', connection })
const db = knex({ client: 'pg', connection, searchPath: [schema] })
before(async () => {
  await root.raw(`CREATE SCHEMA ${schema}`)
  for (const table of ['product_variant', 'inventory_item']) {
    await db.schema.createTable(table, t => {
      t.text('id').primary()
      for (const column of ['width', 'height', 'length', 'weight']) t.integer(column).nullable()
      t.integer('quantity')
    })
    await db(table).insert({ id: 'existing', width: 12, height: 0, length: null, weight: 7, quantity: 3 })
  }
})
after(async () => {
  await db.destroy()
  await root.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await root.destroy()
})
test('migration preserves existing data, stores decimals, is repeatable and leaves quantities integer', async () => {
  await db.transaction(trx => trx.raw(decimalAttributesSchema))
  for (const table of ['product_variant', 'inventory_item']) {
    assert.deepEqual(await db(table).where({ id: 'existing' }).first(), { id: 'existing', width: 12, height: 0, length: null, weight: 7, quantity: 3 })
    await db(table).where({ id: 'existing' }).update({ width: 1.25, height: .005, length: 12.75, weight: .125 })
    assert.deepEqual(await db(table).where({ id: 'existing' }).first(), { id: 'existing', width: 1.25, height: .005, length: 12.75, weight: .125, quantity: 3 })
    const column = await db('information_schema.columns').where({ table_schema: schema, table_name: table, column_name: 'quantity' }).first()
    assert.equal(column.data_type, 'integer')
  }
  await db.transaction(trx => trx.raw(decimalAttributesSchema))
  assert.equal((await db('product_variant').first()).width, 1.25)
})
