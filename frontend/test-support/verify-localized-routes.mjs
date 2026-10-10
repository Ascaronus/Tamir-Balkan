import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

// Real-server regression: locale headers must survive production routing.
const port = 3137
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Preview server did not start')), 30000)
    let output = ''
    const observe = chunk => { output += chunk.toString(); if (output.includes('Ready in')) { clearTimeout(timer); resolve() } }
    server.stdout.on('data', observe)
    server.stderr.on('data', observe)
    server.once('exit', code => { clearTimeout(timer); reject(Error(`Preview server exited: ${code}`)) })
  })
  for (const [path, language] of [['/en/privacy', 'en'], ['/privacy', 'sr'], ['/en/terms', 'en'], ['/en/cart', 'en'], ['/rs/cart', 'sr'], ['/en/account/login', 'en']]) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { 'Accept-Language': language === 'en' ? 'ru-RU' : 'en-US', Cookie: `store_locale=${language === 'en' ? 'sr' : 'en'}` }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    assert.equal(res.status, 200, path)
    const html = await res.text()
    assert.match(html, new RegExp(`<html[^>]*lang="${language}"`), path)
    if (path.endsWith('/privacy')) {
      assert.ok(html.includes(`rel="canonical" href="https://tamir.rs${path}"`), path)
      assert.ok(html.includes('hrefLang="en"') || html.includes('hreflang="en"'), path)
    }
    if (path.includes('/cart') || path.includes('/account')) assert.match(html, /name="robots" content="noindex/, path)
    if (language === 'en') assert.doesNotMatch(html, /<a[^>]*href="\/rs\//, path)
    console.log(`PASS ${path}: ${language}`)
  }
  for (const [language, cookie] of [['en-GB', ''], ['ru-RU,en;q=0.8', 'en']]) {
    const res = await fetch(`http://127.0.0.1:${port}/?q=hat`, { headers: { 'Accept-Language': language, Cookie: cookie ? `store_locale=${cookie}` : '' }, redirect: 'manual' })
    assert.equal(res.status, 307)
    assert.equal(new URL(res.headers.get('location'), `http://127.0.0.1:${port}`).pathname, '/en')
    assert.equal(new URL(res.headers.get('location'), `http://127.0.0.1:${port}`).search, '?q=hat')
    assert.match(res.headers.get('cache-control'), /no-store/)
  }
  const publicEntry = await fetch(`http://127.0.0.1:${port}/?q=hat`, {
    headers: { Host: 'tamir.rs', 'X-Forwarded-Proto': 'https', 'Accept-Language': 'en-US' }, redirect: 'manual',
  })
  assert.equal(publicEntry.status, 307)
  assert.equal(publicEntry.headers.get('location'), 'https://tamir.rs/en?q=hat')
  console.log('PASS public redirect behind reverse proxy')
} finally {
  server.kill('SIGTERM')
}
