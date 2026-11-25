const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { readFileSync } = require('node:fs')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
// The QA CAPTCHA opt-out is compiled from source exactly as the API runtime does,
// so the guard below is the shipped guard rather than a copy that can drift.
const compiled = ts.transpileModule(readFileSync(path.join(__dirname, '../src/utils/captcha.ts'), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
// The shipped guard throws ReviewError from ./review-validation; the sandbox resolves
// that import to the same shape, so assertions see the shipped error codes.
class ReviewError extends Error {
	constructor(status, code) {
		super(code)
		this.status = status
		this.code = code
	}
}
function sandboxRequire(id) {
	if (id === './review-validation') return { ReviewError }
	throw new Error(`Unexpected import in the sandbox: ${id}`)
}
const { captchaBypassAccepted, requestHost, QA_CAPTCHA_BYPASS_FIELD } = runInNewContext(
	compiled + '\nmodule.exports = { captchaBypassAccepted: exports.captchaBypassAccepted, requestHost: exports.requestHost, QA_CAPTCHA_BYPASS_FIELD: exports.QA_CAPTCHA_BYPASS_FIELD }',
	{ module: { exports: {} }, exports: {}, process, require: sandboxRequire, URL, URLSearchParams, Error }
)
const QA_TOKEN = 'qa-bypass-token-for-tests'
const STAGING = 'staging.tamir.internal'

function withEnvironment(overrides, run) {
	const names = ['NODE_ENV', 'TURNSTILE_SECRET_KEY', 'VERCEL_URL', 'QA_CAPTCHA_BYPASS_TOKEN', 'QA_CAPTCHA_BYPASS_HOSTNAMES']
	const saved = names.map((name) => ({ name, value: process.env[name] }))
	Object.assign(process.env, overrides)
	try {
		return run()
	} finally {
		for (const { name, value } of saved) {
			if (value === undefined) delete process.env[name]
			else process.env[name] = value
		}
	}
}

function request(body = {}, headers = { host: STAGING }) {
	return { body, headers }
}

function marked(extra = {}) {
	return { [QA_CAPTCHA_BYPASS_FIELD]: QA_TOKEN, email: 'qa@example.test', ...extra }
}

test('QA opt-out stays off until both a token and an explicit host list exist', () => {
	withEnvironment({ NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'secret' }, () => {
		assert.equal(captchaBypassAccepted(request(marked())), false, 'no token means no bypass')
		process.env.QA_CAPTCHA_BYPASS_TOKEN = QA_TOKEN
		assert.equal(captchaBypassAccepted(request(marked())), false, 'no host list means no bypass')
		process.env.QA_CAPTCHA_BYPASS_HOSTNAMES = '   '
		assert.equal(captchaBypassAccepted(request(marked())), false, 'blank host list means no bypass')
	})
})

test('QA opt-out needs the configured host and the matching mark together', () => {
	withEnvironment({
		NODE_ENV: 'production',
		TURNSTILE_SECRET_KEY: 'secret',
		QA_CAPTCHA_BYPASS_TOKEN: QA_TOKEN,
		QA_CAPTCHA_BYPASS_HOSTNAMES: STAGING,
	}, () => {
		assert.equal(captchaBypassAccepted(request(marked())), true, 'configured host plus mark')
		assert.equal(captchaBypassAccepted(request(marked(), { host: `${STAGING}:9000` })), true, 'Host may carry a port')
		assert.equal(captchaBypassAccepted(request(marked(), { host: STAGING.toUpperCase() })), true, 'Host is case-insensitive')
		assert.equal(captchaBypassAccepted(request(marked(), { host: 'other.tamir.internal' })), false, 'host outside the list')
		assert.equal(captchaBypassAccepted(request(marked(), {})), false, 'request without Host')
		assert.equal(captchaBypassAccepted(request({ email: 'qa@example.test' })), false, 'request without the mark')
		assert.equal(captchaBypassAccepted(request({ [QA_CAPTCHA_BYPASS_FIELD]: 'wrong-token' })), false, 'mark with a wrong token')
		assert.equal(captchaBypassAccepted(request({ [QA_CAPTCHA_BYPASS_FIELD]: true })), false, 'mark must be the exact token')
		assert.equal(captchaBypassAccepted(request([])), false, 'array body is not a request payload')
		assert.equal(captchaBypassAccepted({ headers: { host: STAGING } }), false, 'request without body')
	})
})

test('QA opt-out cannot be switched on for a production storefront host', () => {
	withEnvironment({
		NODE_ENV: 'production',
		TURNSTILE_SECRET_KEY: 'secret',
		QA_CAPTCHA_BYPASS_TOKEN: QA_TOKEN,
		// Deliberately misconfigured: the allow list names the public storefront.
		QA_CAPTCHA_BYPASS_HOSTNAMES: 'tamir.rs,www.tamir.rs',
	}, () => {
		for (const host of ['tamir.rs', 'www.tamir.rs', 'TAMIR.RS']) {
			assert.equal(captchaBypassAccepted(request(marked(), { host })), false, `production host ${host}`)
		}
	})
	withEnvironment({
		NODE_ENV: 'production',
		TURNSTILE_SECRET_KEY: 'secret',
		QA_CAPTCHA_BYPASS_TOKEN: QA_TOKEN,
		QA_CAPTCHA_BYPASS_HOSTNAMES: 'tamir.rs',
	}, () => {
		assert.equal(captchaBypassAccepted(request(marked(), { host: 'tamir.rs:443' })), false, 'production host with a port')
	})
})

test('QA opt-out rejects a request whose Origin names a different host', () => {
	withEnvironment({
		NODE_ENV: 'production',
		TURNSTILE_SECRET_KEY: 'secret',
		QA_CAPTCHA_BYPASS_TOKEN: QA_TOKEN,
		QA_CAPTCHA_BYPASS_HOSTNAMES: STAGING,
	}, () => {
		assert.equal(captchaBypassAccepted(request(marked(), { host: STAGING, origin: `https://${STAGING}` })), true, 'same-origin request')
		assert.equal(captchaBypassAccepted(request(marked(), { host: STAGING, origin: 'https://evil.example' })), false, 'cross-site request')
		assert.equal(captchaBypassAccepted(request(marked(), { host: STAGING, origin: 'not a url' })), true, 'unparsable Origin falls back to Host')
		assert.equal(requestHost({ headers: { host: 'Example.Tamir.rs:3000', origin: `https://${STAGING}` } }), 'example.tamir.rs', 'Host wins over Origin')
	})
})

test('QA opt-out leaves the CAPTCHA check itself untouched', async () => {
	const env = { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_HOSTNAMES: STAGING }
	const { verifyCaptcha } = runInNewContext(
		compiled + '\nmodule.exports = { verifyCaptcha: exports.verifyCaptcha }',
		{
			module: { exports: {} }, exports: {}, URL, URLSearchParams, Error, AbortSignal,
			require: sandboxRequire,
			process: { env },
		}
	)
	const rejected = async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }) })
	const accepted = async (url, options) => {
		assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify', 'provider endpoint')
		assert.match(String(options.body), /response=a-token/, 'token is sent to the provider')
		return { ok: true, json: async () => ({ success: true, hostname: STAGING, action: 'review' }) }
	}
	await assert.rejects(() => verifyCaptcha(undefined, 'review', accepted), e => e.code === 'CAPTCHA_REQUIRED' && e.status === 400)
	await assert.rejects(() => verifyCaptcha('a-token', 'review', rejected), e => e.code === 'CAPTCHA_FAILED' && e.status === 400)
	await assert.rejects(() => verifyCaptcha('a-token', 'review', async () => { throw new Error('provider offline') }), e => e.code === 'CAPTCHA_UNAVAILABLE' && e.status === 503)
	await verifyCaptcha('a-token', 'review', accepted)
})

// The guard only protects the CAPTCHA while the routes keep asking it first, so the
// call sites are part of the contract: a route that checks CAPTCHA without the guard
// would break the stands, and one that trusts the mark without the guard would be a hole.
const CAPTCHA_ROUTES = [
	'../src/api/store/registration/start/route.ts',
	'../src/api/store/password-reset/start/route.ts',
	'../src/api/store/reviews/route.ts',
]

test('every CAPTCHA-protected storefront route asks the QA guard first', () => {
	for (const route of CAPTCHA_ROUTES) {
		const source = readFileSync(path.join(__dirname, route), 'utf8')
		assert.match(source, /if \(!captchaBypassAccepted\(req\)\) await verifyCaptcha\(/, route)
	}
})
