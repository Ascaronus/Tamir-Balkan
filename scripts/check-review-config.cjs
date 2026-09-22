// Check the same environment that will run the staged release. Never print key values.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const dotenv = require(path.join(root, 'backend/node_modules/dotenv'))
const config = fs.existsSync(path.join(root, 'ecosystem.config.cjs')) ? require(path.join(root, 'ecosystem.config.cjs')) : { apps: [] }
function envFor(app, files) {
  const result = { ...process.env, ...(config.apps.find(p => p.name === `tamir-${app}`)?.env || {}) }
  for (const file of files) {
    const name = path.join(root, app, file)
    if (fs.existsSync(name)) for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(name)))) if (result[key] === undefined) result[key] = value
  }
  return result
}
const backend = envFor('backend', ['.env'])
const frontend = envFor('frontend', ['.env.production.local', '.env.local', '.env.production', '.env'])
const issues = []
for (const [label, value] of [['backend TURNSTILE_SECRET_KEY', backend.TURNSTILE_SECRET_KEY], ['frontend NEXT_PUBLIC_TURNSTILE_SITE_KEY', frontend.NEXT_PUBLIC_TURNSTILE_SITE_KEY]]) {
  if (!value || !value.trim() || /^[123]x00000000000000000000/.test(value)) issues.push(`${label}: set a real production key`)
}
if ((backend.REVIEW_RATE_SECRET || backend.JWT_SECRET || '').length < 32) issues.push('backend REVIEW_RATE_SECRET: set a random secret of at least 32 characters')
if (issues.length) { console.error('Review/CAPTCHA configuration missing. Deployment stopped before activation:\n' + issues.join('\n')); process.exit(1) }
console.log('Review/CAPTCHA configuration present (provider connectivity and domain registration require a live check).')
