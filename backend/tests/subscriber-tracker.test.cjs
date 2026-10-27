const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createSubscriberTracker } = require('../integration-tests/helpers/subscriber-tracker')
const turn = () => new Promise(resolve => setImmediate(resolve))

test('subscriber observer waits for real asynchronous work before cleanup', async () => {
  const tracker = createSubscriberTracker()
  const order = []
  let release
  const gate = new Promise(resolve => { release = resolve })
  const wrapped = tracker.trackSubscriber(async value => {
    await gate
    order.push(value)
    return 42
  })
  const task = wrapped('committed')
  const drained = tracker.waitForSubscribers().then(() => order.push('truncate'))
  await turn()
  assert.deepEqual(order, [])
  release()
  assert.equal(await task, 42)
  await drained
  assert.deepEqual(order, ['committed', 'truncate'])
})

test('subscriber failure remains visible even when event bus catches it', async () => {
  const tracker = createSubscriberTracker()
  const failure = new Error('missing schema')
  await tracker.trackSubscriber(async () => { throw failure })().catch(() => {})
  await assert.rejects(tracker.waitForSubscribers(), error => {
    assert.ok(error instanceof AggregateError)
    assert.deepEqual(error.errors, [failure])
    return true
  })
  await tracker.waitForSubscribers()
})

test('subscriber observer drains queued and nested events', async () => {
  const tracker = createSubscriberTracker()
  const order = []
  const child = tracker.trackSubscriber(async () => { await turn(); order.push('child') })
  const parent = tracker.trackSubscriber(async () => { await turn(); void child(); order.push('parent') })
  Promise.resolve().then(() => parent())
  await tracker.waitForSubscribers()
  assert.deepEqual(order, ['parent', 'child'])
})

test('subscriber observer reports pending work with a bounded wait', async () => {
  const tracker = createSubscriberTracker()
  let release
  const task = tracker.trackSubscriber(() => new Promise(resolve => { release = resolve }))()
  await assert.rejects(tracker.waitForSubscribers(20), /Timed out waiting for 1 catalog subscriber/)
  release()
  await task
  await tracker.waitForSubscribers()
})

test('real Medusa local event bus returns before listeners; observer closes that gap', async () => {
  const LocalEventBus = require('@medusajs/event-bus-local').service
  const tracker = createSubscriberTracker()
  const bus = new LocalEventBus({ logger: { info() {}, error() {} } }, {}, {})
  const event = 'tracker-test-' + process.pid
  let release
  let completed = false
  const gate = new Promise(resolve => { release = resolve })
  const subscriber = tracker.trackSubscriber(async () => { await gate; completed = true })
  const context = { subscriberId: event }
  bus.subscribe(event, subscriber, context)
  try {
    await bus.emit({ name: event, data: { id: 'fixture' } })
    assert.equal(completed, false)
    const drained = tracker.waitForSubscribers()
    release()
    await drained
    assert.equal(completed, true)
  } finally {
    release()
    bus.unsubscribe(event, subscriber, context)
  }
})
