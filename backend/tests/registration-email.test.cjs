const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const nodemailer = require('nodemailer').default
const { mailConfig, welcomeMessage, sendRegistrationCode, sendPasswordResetCode } = require('../src/utils/registration-email')
const subscriber = require('../src/subscribers/customer-welcome').default

test('SMTP requires credentials and encryption', () => {
  assert.throws(() => mailConfig({}), /configure/)
  assert.throws(() => mailConfig({ SMTP_USER: 'x', SMTP_PASSWORD: 'test', SMTP_PORT: '25' }), /587 or 465/)
  const config = mailConfig({ SMTP_USER: 'sender@example.test', SMTP_PASSWORD: 'abcd efgh' })
  assert.equal(config.requireTLS, true)
  assert.equal(config.auth.pass, 'abcdefgh')
  assert.equal(config.port, 587)
})
test('welcome message keeps bilingual text and escapes the name in branded HTML', () => {
  const mail = welcomeMessage('<Igor>')
  assert.match(mail.text, /Zdravo, <Igor>/)
  assert.match(mail.text, /Your TAMIR account has been created/)
  assert.match(mail.html, /Zdravo, &lt;Igor&gt;/)
  assert.match(mail.html, /Your TAMIR account has been created/)
  assert.ok(!mail.html.includes('<Igor>'))
  assert.match(mail.html, /max-width:640px/)
})
test('registered customer gets one email; guests are skipped; failures remain retryable and sanitized', async () => {
  const original = nodemailer.createTransport
  const oldUser = process.env.SMTP_USER, oldPassword = process.env.SMTP_PASSWORD
  process.env.SMTP_USER = 'sender@example.test'
  process.env.SMTP_PASSWORD = 'fake-test-password'
  let sent = [], fail = false, closed = 0
  nodemailer.createTransport = () => ({ sendMail: async mail => {
    if (fail) throw Error('secret-password recipient@example.test')
    sent.push(mail)
    return { accepted: ['recipient@example.test'] }
  }, close: () => closed++ })
  let customer = { id: 'cus_test', has_account: true, email: 'recipient@example.test', metadata: { keep: true } }
  const trx = () => ({ where() { return this }, whereNull() { return this }, forUpdate() { return this },
    first: async () => customer, update: async data => { Object.assign(customer, data) } })
  const args = { event: { data: { id: 'cus_test' } }, container: { resolve: () => ({ transaction: fn => fn(trx) }) } }
  try {
    await subscriber(args)
    await subscriber(args)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].from.address, 'sender@example.test')
    assert.equal(sent[0].to.address, customer.email)
    assert.equal(customer.metadata.keep, true)
    customer = { ...customer, has_account: false, metadata: {} }
    await subscriber(args)
    assert.equal(sent.length, 1)
    customer.has_account = true
    fail = true
    await assert.rejects(subscriber(args), error => !/secret-password|recipient@example/.test(error.message))
    assert.equal(customer.metadata.tamir_welcome_sent_at, undefined)
    fail = false
    await subscriber(args)
    assert.equal(sent.length, 2)
    assert.equal(closed, 3)
  } finally {
    nodemailer.createTransport = original
    if (oldUser === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = oldUser
    if (oldPassword === undefined) delete process.env.SMTP_PASSWORD; else process.env.SMTP_PASSWORD = oldPassword
  }
})

test('registration and reset SMTP messages include styled HTML, the same code and expiry as text', async () => {
  const original = nodemailer.createTransport
  const saved = { SMTP_USER: process.env.SMTP_USER, SMTP_PASSWORD: process.env.SMTP_PASSWORD }
  process.env.SMTP_USER = 'sender@example.test'; process.env.SMTP_PASSWORD = 'test-only'
  const sent = []
  nodemailer.createTransport = () => ({ sendMail: async mail => { sent.push(mail); return { accepted: ['customer@example.test'] } }, close() {} })
  try {
    await sendRegistrationCode('customer@example.test', '012345')
    await sendPasswordResetCode('customer@example.test', '012345')
    assert.equal(sent.length, 2)
    assert.match(sent[0].subject, /Registration code/); assert.match(sent[1].subject, /Password reset/)
    for (const mail of sent) {
      for (const part of [mail.text, mail.html]) {
        assert.match(part, /012345/); assert.match(part, /10 minuta/); assert.match(part, /10 minutes/)
        assert.match(part, /Ne delite/); assert.match(part, /Do not share/)
      }
      assert.match(mail.html, /max-width:640px/)
      assert.equal(mail.disableFileAccess, true); assert.equal(mail.disableUrlAccess, true)
    }
    assert.match(sent[1].html, /your password remains unchanged/)
    const { accountCodeMessage } = require('../src/utils/registration-email')
    assert.ok(accountCodeMessage('<img src=x>', false).html.includes('&lt;img src=x&gt;'))
  } finally {
    nodemailer.createTransport = original
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
