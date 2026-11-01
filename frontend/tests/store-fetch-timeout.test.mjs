import test from 'node:test'
import assert from 'node:assert/strict'
import { STORE_FETCH_TIMEOUT_MS, timedSignal } from '../src/lib/store/fetch-timeout.ts'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('store fetches have a single shared deadline constant', () => {
  assert.equal(STORE_FETCH_TIMEOUT_MS, 8000)
})

test('deadline aborts the signal with a TimeoutError and done() stops the timer', async () => {
  const early = timedSignal(undefined, 10)
  assert.equal(early.signal.aborted, false)
  await sleep(40)
  assert.equal(early.signal.aborted, true)
  assert.equal(early.signal.reason.name, 'TimeoutError')

  const cancelled = timedSignal(undefined, 10)
  cancelled.done()
  await sleep(40)
  assert.equal(cancelled.signal.aborted, false)
})

test('external abort is relayed with its reason and unregistered by done()', async () => {
  const caller = new AbortController()
  const live = timedSignal(caller.signal, 1000)
  assert.equal(live.signal.aborted, false)
  caller.abort()
  assert.equal(live.signal.aborted, true)
  assert.equal(live.signal.reason.name, 'AbortError')
  assert.equal(live.signal.reason, caller.signal.reason)

  const detached = new AbortController()
  const released = timedSignal(detached.signal, 1000)
  released.done()
  detached.abort()
  assert.equal(released.signal.aborted, false)
  // done() повторяемый: слушатель уже снят, ошибок нет.
  released.done()
})

test('an already aborted caller never starts a live request window', () => {
  const caller = new AbortController()
  caller.abort()
  const t = timedSignal(caller.signal)
  assert.equal(t.signal.aborted, true)
  assert.equal(t.signal.reason, caller.signal.reason)
  t.done()
})
