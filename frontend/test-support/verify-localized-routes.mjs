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
  for (const [path, language] of [['/en/privacy', 'en'], ['/privacy', 'sr'], ['/en/terms', 'en'], ['/en/cart', 'en'], ['/rs/korpa', 'sr'], ['/rs/nalog', 'sr'], ['/rs/nalog/prijava', 'sr'], ['/rs/nalog/registracija', 'sr'], ['/rs/nalog/zaboravljena-lozinka', 'sr'], ['/rs', 'sr'], ['/en', 'en'], ['/en/account/login', 'en']]) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { 'Accept-Language': language === 'en' ? 'ru-RU' : 'en-US', Cookie: `store_locale=${language === 'en' ? 'sr' : 'en'}` }, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    assert.equal(res.status, 200, path)
    const html = await res.text()
    assert.match(html, new RegExp(`<html[^>]*lang="${language}"`), path)
    if (path === '/rs' || path === '/en') {
      assert.ok(html.includes(`rel="canonical" href="https://tamir.rs${path}"`), path)
      assert.ok(html.includes('href="/rs/korpa"') || language === 'en', path)
      assert.ok(html.includes('href="/rs/nalog/prijava"') || language === 'en', path)
    }
    if (path.endsWith('/privacy')) {
      assert.ok(html.includes(`rel="canonical" href="https://tamir.rs${path}"`), path)
      assert.ok(html.includes('hrefLang="en"') || html.includes('hreflang="en"'), path)
    }
    if (/\/(cart|account|korpa|nalog)(\/|$)/.test(path)) assert.match(html, /name="robots" content="noindex/, path)
    if (language === 'en') assert.doesNotMatch(html, /<a[^>]*href="\/rs\//, path)
    console.log(`PASS ${path}: ${language}`)
  }
  for (const [language, cookie, expected] of [['en-GB', '', '/en'], ['ru-RU,en;q=0.8', 'en', '/en'], ['ru-RU,en;q=0.8', '', '/rs'], ['sr-Latn-RS', '', '/rs'], ['', '', '/rs'], ['en-US', 'sr', '/rs']]) {
    const res = await fetch(`http://127.0.0.1:${port}/?q=hat`, { headers: { 'Accept-Language': language, Cookie: cookie ? `store_locale=${cookie}` : '' }, redirect: 'manual' })
    assert.equal(res.status, 307)
    assert.equal(new URL(res.headers.get('location'), `http://127.0.0.1:${port}`).pathname, expected)
    assert.equal(new URL(res.headers.get('location'), `http://127.0.0.1:${port}`).search, '?q=hat')
    assert.match(res.headers.get('cache-control'), /no-store/)
  }
  for (const [oldPath, newPath] of [['/rs/cart', '/rs/korpa'], ['/rs/account', '/rs/nalog'], ['/rs/account/login', '/rs/nalog/prijava'], ['/rs/account/register', '/rs/nalog/registracija'], ['/rs/account/forgot-password', '/rs/nalog/zaboravljena-lozinka']]) {
    const res = await fetch(`http://127.0.0.1:${port}${oldPath}?next=checkout`, { redirect: 'manual' })
    assert.equal(res.status, 308, oldPath)
    const target = new URL(res.headers.get('location'), `http://127.0.0.1:${port}`)
    assert.equal(target.pathname, newPath)
    assert.equal(target.search, '?next=checkout')
  }
  const publicEntry = await fetch(`http://127.0.0.1:${port}/?q=hat`, {
    headers: { Host: 'tamir.rs', 'X-Forwarded-Proto': 'https', 'Accept-Language': 'en-US' }, redirect: 'manual',
  })
  assert.equal(publicEntry.status, 307)
  assert.equal(new URL(publicEntry.headers.get('location'), 'https://tamir.rs').href, 'https://tamir.rs/en?q=hat')
  console.log('PASS public redirect behind reverse proxy')
} finally {
  server.kill('SIGTERM')
}
