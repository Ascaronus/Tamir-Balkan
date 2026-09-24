const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
require('ts-node/register/transpile-only')
const { parseDecimal, optionalDecimal, nullableDecimal, normalizeDecimalDraft } = require('../src/admin/decimal/number')
const { decimalAdminConfig, transformDecimalDashboard } = require('../src/utils/admin-decimal-vite')
const dist = path.join(path.dirname(require.resolve('@medusajs/dashboard/package.json')), 'dist')
const chunks = fs.readdirSync(dist).filter(f => f.endsWith('.mjs')).map(f => fs.readFileSync(path.join(dist, f), 'utf8'))

test('comma and dot decimals, zero and optional cleared measurements survive validation', () => {
  for (const [input, expected] of [['1,25', 1.25], ['0,001', .001], ['12.75', 12.75], ['0', 0], [0, 0], ['.5', .5], ['1,', 1]]) {
    assert.equal(nullableDecimal.parse(input), expected)
    assert.equal(parseDecimal(input), expected)
  }
  for (const input of ['', null, undefined]) assert.equal(nullableDecimal.parse(input), null)
  for (const input of ['-1', '1,2.3', '1,2,3', '12abc', 'Infinity', Infinity, NaN, ' ']) {
    assert.equal(optionalDecimal.safeParse(input).success, false, String(input))
  }
})

test('money drafts preserve separator and zeroes; ambiguous pastes do not become another amount', () => {
  for (const [raw, expected] of [['1,', '1.'], ['1,20', '1.20'], ['0,05', '0.05'], ['1250.50', '1250.50'], ['1 250,50', '1250.50']]) {
    assert.equal(normalizeDecimalDraft(raw), expected)
  }
  for (const raw of ['1,234.56', '12abc', '1,2,3']) assert.equal(normalizeDecimalDraft(raw, '5'), '5')
})

test('all pinned dashboard patches apply, compile and leave quantity forms untouched', () => {
  decimalAdminConfig(path.resolve(__dirname, '..')).plugins[0].buildStart()
  let changed = 0
  for (const code of chunks) {
    const result = transformDecimalDashboard(code, '/decimal-test')
    if (!result) continue
    changed++
    require('esbuild').transformSync(result, { loader: 'js' })
    const sections = code.split(/(?=^\/\/ src\/)/m)
    for (const section of sections) {
      if (/^\/\/ src\/.*(?:inventory-kit|adjust-inventory-form|data-grid-number-cell)/.test(section)) {
        assert.ok(result.includes(section), 'quantity section must not be modified')
      }
    }
  }
  assert.ok(changed >= 10)
})

test('actual product edit schema returns API-ready decimals and rejects malformed input', () => {
  const code = transformDecimalDashboard(chunks.find(c => c.includes('var ProductAttributesSchema =')), '/decimal-test')
  const schemaSource = code.slice(code.indexOf('var dimension ='), code.indexOf('var ProductAttributesForm ='))
  const schema = new Function('tamirNullableDecimal', 'zod', schemaSource + '; return ProductAttributesSchema;')(nullableDecimal, require('zod'))
  assert.deepEqual(schema.parse({ width: '1,25', height: '0,005', length: '0', weight: '' }), { width: 1.25, height: .005, length: 0, weight: null })
  assert.equal(schema.safeParse({ width: '1,2,3' }).success, false)
  assert.match(code, /onChange\(value2\)/)
  assert.doesNotMatch(code, /onChange\((?:parseFloat|Number)\(/)
})

test('unexpected upstream changes fail loudly instead of silently omitting the fix', () => {
  const code = chunks.find(c => c.includes('var ProductAttributesSchema ='))
  assert.throws(() => transformDecimalDashboard(code.replace('type: "number"', 'type: "text"'), '/decimal-test'), /expected 4 matches/)
})
