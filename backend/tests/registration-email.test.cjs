const { test } = require('node:test')
const assert = require('node:assert/strict')
require('ts-node/register/transpile-only')
const nodemailer = require('nodemailer').default
const { mailConfig, welcomeMessage } = require('../src/utils/registration-email')
const subscriber = require('../src/subscribers/customer-welcome').default

test('SMTP requires credentials and encryption', () => {
  assert.throws(() => mailConfig({}), /configure/)
  assert.throws(() => mailConfig({ SMTP_USER: 'x', SMTP_PASSWORD: 'test', SMTP_PORT: '25' }), /587 or 465/)
  const config = mailConfig({ SMTP_USER: 'sender@example.test', SMTP_PASSWORD: 'abcd efgh' })
  assert.equal(config.requireTLS, true)
  assert.equal(config.auth.pass, 'abcdefgh')
  assert.equal(config.port, 587)
})
test('welcome message is bilingual plain text', () => {
  const mail = welcomeMessage('<Igor>')
  assert.match(mail.text, /Zdravo, <Igor>/)
  assert.match(mail.text, /Your TAMIR account has been created/)
  assert.equal(mail.html, undefined)
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
