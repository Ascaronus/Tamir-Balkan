import test from "node:test"
import assert from "node:assert/strict"
import nextConfig from "../next.config.ts"

/** Значение при импорте конфига: `images.remotePatterns` вычисляются один раз — при загрузке. */
const ENV_AT_IMPORT = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL

/** Подменяем переменные окружения вокруг проверки: `headers()` читает env в момент вызова. */
async function withEnv(vars, run) {
  const previous = new Map(
    Object.keys(vars).map(key => [key, process.env[key]]),
  )
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return await run()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function headerValues() {
  const rules = await nextConfig.headers()
  assert.equal(rules.length, 1)
  assert.equal(rules[0].source, "/:path*")
  const values = new Map(rules[0].headers.map(header => [header.key, header.value]))
  return values
}

async function csp() {
  const directive = (await headerValues()).get("Content-Security-Policy")
  const parts = {}
  for (const entry of directive.split(";")) {
    const [name, ...rest] = entry.trim().split(/\s+/)
    parts[name] = rest
  }
  return parts
}

test("production responses carry the full set of security headers", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    const headers = await headerValues()
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff")
    assert.equal(headers.get("X-Frame-Options"), "DENY")
    assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")
    assert.equal(headers.get("X-Permitted-Cross-Domain-Policies"), "none")
    assert.equal(headers.get("Cross-Origin-Opener-Policy"), "same-origin")
    assert.match(headers.get("Permissions-Policy"), /camera=\(\), microphone=\(\), geolocation=\(\)/)
    // Только хост витрины, без `includeSubDomains`: браузер не должен переносить правило на `vpn.tamir.rs`.
    assert.equal(headers.get("Strict-Transport-Security"), "max-age=31536000")
  })
})

test("HSTS is not sent to local development responses", async () => {
  await withEnv({ NODE_ENV: "development" }, async () => {
    const headers = await headerValues()
    assert.equal(headers.get("Strict-Transport-Security"), undefined)
    assert.ok(headers.get("Content-Security-Policy"), "CSP остаётся и в разработке")
  })
})

test("Next.js stops advertising itself", () => {
  assert.equal(nextConfig.poweredByHeader, false)
})

test("CSP blocks framing and restricts forms and base documents to the storefront origin", async () => {
  const parts = await csp()
  assert.deepEqual(parts["default-src"], ["'self'"])
  assert.deepEqual(parts["frame-ancestors"], ["'none'"])
  assert.deepEqual(parts["base-uri"], ["'self'"])
  assert.deepEqual(parts["form-action"], ["'self'"])
  assert.deepEqual(parts["font-src"], ["'self'"], "next/font/google self-hosts шрифты на сборке")
})

test("CSP lists exactly the third-party origins the storefront actually loads", async () => {
  const parts = await csp()
  const allowed = ["https://www.googletagmanager.com", "https://challenges.cloudflare.com"]
  for (const origin of allowed) {
    assert.ok(parts["script-src"].includes(origin), `script-src must allow ${origin}`)
    assert.ok(parts["connect-src"].includes(origin), `connect-src must allow ${origin}`)
  }
  assert.ok(parts["script-src"].includes("'unsafe-inline'"), "Next bootstrap and JSON-LD are inline")
  assert.ok(parts["style-src"].includes("'unsafe-inline'"), "Tailwind styles are injected inline")
  assert.ok(parts["frame-src"].includes("https://challenges.cloudflare.com"), "Turnstile renders in its iframe")
  assert.ok(
    !parts["script-src"].some(value => /^https?:\/\//.test(value) && !allowed.includes(value)),
    "лишних внешних скриптов в CSP нет",
  )
  assert.equal(parts["frame-src"].length, 1)
})

test("CSP allows eval only for the development runner", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    assert.ok(!(await csp())["script-src"].includes("'unsafe-eval'"))
  })
  await withEnv({ NODE_ENV: "development" }, async () => {
    assert.ok((await csp())["script-src"].includes("'unsafe-eval'"), "HMR-раннер `next dev` исполняет модули через eval")
  })
})

test("CSP follows the configured Store API origin", async () => {
  await withEnv({ NEXT_PUBLIC_MEDUSA_BACKEND_URL: "https://api.tamir.rs" }, async () => {
    const parts = await csp()
    assert.ok(parts["connect-src"].includes("https://api.tamir.rs"))
    assert.ok(parts["img-src"].includes("https://api.tamir.rs"))
  })
})

test("CSP stays usable in local development without NEXT_PUBLIC_MEDUSA_BACKEND_URL", async () => {
  await withEnv({ NEXT_PUBLIC_MEDUSA_BACKEND_URL: undefined }, async () => {
    const parts = await csp()
    assert.ok(parts["connect-src"].includes("*://*"))
    assert.ok(parts["img-src"].includes("*://*"))
  })
})

test("every next/image remote origin is also allowed by CSP img-src", async () => {
  await withEnv({ NEXT_PUBLIC_MEDUSA_BACKEND_URL: ENV_AT_IMPORT }, async () => {
    const parts = await csp()
    for (const origin of ["https://medusa-public-images.s3.eu-west-1.amazonaws.com", "https://tamir.ua"]) {
      assert.ok(parts["img-src"].includes(origin), `img-src must keep ${origin}`)
    }
    for (const pattern of nextConfig.images.remotePatterns) {
      // `remotePatterns` описывает origin без пути, но с портом — CSP сверяем в том же виде.
      const origin = `${pattern.protocol}://${pattern.hostname}${pattern.port ? `:${pattern.port}` : ""}`
      assert.ok(parts["img-src"].includes(origin), `next/image грузит ${origin}, а CSP его запрещает`)
    }
  })
})
