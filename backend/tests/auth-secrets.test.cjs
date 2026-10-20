const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { randomBytes } = require('node:crypto')
const ts = require('typescript')

// Evaluate the actual config without starting Medusa or touching a database.
const source = readFileSync(path.join(__dirname, '../medusa-config.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
function config(env) {
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, __dirname: path.join(__dirname, '..'),
    process: { env, cwd: () => path.join(__dirname, '..') },
    require(name) {
      if (name === 'node:path') return path
      if (name === '@medusajs/framework/utils') return {
        loadEnv() {}, defineConfig: value => value, Modules: { FULFILLMENT: 'fulfillment' },
      }
      if (name === './src/utils/admin-decimal-vite') return { decimalAdminConfig: () => ({}) }
      throw Error(`Unexpected dependency: ${name}`)
    },
  })
  return module.exports
}
const secrets = () => ({
  JWT_SECRET: randomBytes(32).toString('hex'),
  COOKIE_SECRET: randomBytes(32).toString('hex'),
})

test('actual config refuses missing, weak and template secrets in dev and production', () => {
  for (const NODE_ENV of ['development', 'production', 'test']) {
    for (const name of ['JWT_SECRET', 'COOKIE_SECRET']) {
      for (const value of [undefined, '', ' '.repeat(64), 'short', 'supersecret', 'REPLACE_WITH_LOCAL_RANDOM_SECRET_AT_LEAST_32_CHARACTERS']) {
        assert.throws(() => config({ ...secrets(), NODE_ENV, [name]: value }), new RegExp(name))
      }
    }
  }
})

test('explicit secrets reach Medusa unchanged without an embedded fallback', () => {
  const env = secrets()
  const result = config(env).projectConfig.http
  assert.equal(result.jwtSecret, env.JWT_SECRET)
  assert.equal(result.cookieSecret, env.COOKIE_SECRET)
})

test('configuration errors name the variable without disclosing its value', () => {
  const value = `placeholder-${randomBytes(32).toString('hex')}`
  assert.throws(() => config({ ...secrets(), JWT_SECRET: value }), error => {
    assert.match(error.message, /JWT_SECRET/)
    assert.ok(!error.message.includes(value))
    return true
  })
})
