// Test-only observer: execute the real subscriber and wait for it before the
// Medusa runner truncates tables. LocalEventBus.emit does not await listeners.
function createSubscriberTracker() {
  const pending = new Set()
  const failures = []
  let completed = 0

  function trackSubscriber(subscriber) {
    return function (...args) {
      const task = Promise.resolve().then(() => subscriber.apply(this, args))
      pending.add(task)
      // Record failures even when LocalEventBus catches and logs the rejection.
      task.then(
        () => { pending.delete(task); completed++ },
        error => { pending.delete(task); failures.push(error) }
      )
      return task
    }
  }

  async function waitForSubscribers(timeoutMs = 10000) {
    let timer
    try {
      await Promise.race([
        (async () => {
          // Allow the local bus's queued emit callbacks to start. A second turn
          // after draining also includes events emitted by another subscriber.
          do {
            await new Promise(resolve => setImmediate(resolve))
            await Promise.allSettled([...pending])
            await new Promise(resolve => setImmediate(resolve))
          } while (pending.size)
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(
            `Timed out waiting for ${pending.size} catalog subscriber(s) before database cleanup`
          )), timeoutMs)
        }),
      ])
      if (failures.length) {
        throw new AggregateError(failures.splice(0), 'Catalog subscribers failed before database cleanup')
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return { trackSubscriber, waitForSubscribers, completedCount: () => completed }
}

module.exports = { createSubscriberTracker, ...createSubscriberTracker() }
