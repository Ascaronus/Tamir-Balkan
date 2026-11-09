const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const { MedusaError } = require('@medusajs/framework/utils')
const { chatBodyErrorHandler } = require('../src/utils/chat/http-errors')
function handle(path, error) {
  const logs = [], result = { headers: {} }
  const req = { path, scope: { resolve: () => ({ error: e => logs.push(e), info: e => logs.push(e) }) } }
  const res = {
    setHeader: (k, v) => { result.headers[k] = v },
    status: code => { result.status = code; return res },
    json: body => { result.body = body; return res },
  }
  chatBodyErrorHandler(error, req, res, () => assert.fail('unexpected next'))
  return { ...result, logs }
}
const oversized = () => Object.assign(new Error('request entity too large'), {
  type: 'entity.too.large', status: 413, body: 'private message',
})
test('chat body parser errors return safe 413 responses without logging or reflecting private payloads', () => {
  for (const path of ['/store/chat/messages', '/store/chat/image-message', '/admin/tamir-chat/settings']) {
    const result = handle(path, oversized())
    assert.equal(result.status, 413)
    assert.deepEqual(result.body, { code: 'PAYLOAD_TOO_LARGE' })
    assert.equal(result.headers['Cache-Control'], 'no-store')
    assert.deepEqual(result.logs, [])
  }
})
test('chat error handler preserves Medusa authentication, authorization and unexpected-error behavior', () => {
  for (const [error, status] of [
    [new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Unauthorized'), 401],
    [new MedusaError(MedusaError.Types.FORBIDDEN, 'Forbidden'), 403],
    [new Error('internal failure'), 500],
  ]) assert.equal(handle('/store/chat/messages', error).status, status)
})
test('chat body limit handling does not replace error handling for unrelated routes or prefix collisions', () => {
  for (const path of ['/store/carts', '/store/chat-other', '/admin/tamir-chat-other']) {
    const result = handle(path, oversized())
    assert.equal(result.status, 500) // Existing Medusa behavior outside the chat scope.
    assert.equal(result.body.code, 'unknown_error')
    assert.equal(result.logs.length, 1)
  }
})
