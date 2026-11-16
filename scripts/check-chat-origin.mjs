import { pathToFileURL } from 'node:url'

// POST config is intentionally not a write endpoint. With no cookies, token or
// conversation id it must reach the backend's ownership check and return 404.
// Never create a session/message just to smoke-test a production deployment.
export async function checkChatOrigin(baseUrl) {
  for (const [origin, status, code] of [
    ['https://tamir.rs', 404, 'CHAT_NOT_FOUND'],
    ['https://www.tamir.rs', 404, 'CHAT_NOT_FOUND'],
    ['https://untrusted.example', 403, 'INVALID_ORIGIN'],
  ]) {
    const response = await fetch(new URL('/api/chat/config', baseUrl), {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: '{}',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    const data = await response.json()
    if (response.status !== status || data.code !== code) {
      throw new Error(`Chat origin check failed at ${baseUrl} for ${origin}: expected ${status} ${code}, got HTTP ${response.status}`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    // The local check exercises the same HTTP reverse-proxy shape as production;
    // public checks also catch nginx/Cloudflare routing to an outdated process.
    for (const baseUrl of ['http://127.0.0.1:3000', 'https://tamir.rs', 'https://www.tamir.rs']) {
      await checkChatOrigin(baseUrl)
      console.log(`Chat origin check passed: ${baseUrl}`)
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
