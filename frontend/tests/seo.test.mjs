import test from "node:test"
import assert from "node:assert/strict"
import { siteUrl, serializeJsonLd } from "../src/lib/seo.ts"

test("structured data cannot close the script element", () => {
  const input = { name: "</script><script>alert(1)</script>" }
  const encoded = serializeJsonLd(input)
  assert.equal(encoded.includes("<"), false)
  assert.deepEqual(JSON.parse(encoded), input)
})
test("canonical URLs use the configured public origin", () => {
  const old = process.env.NEXT_PUBLIC_SITE_URL
  try {
    process.env.NEXT_PUBLIC_SITE_URL = "https://tamir.rs/"
    assert.equal(siteUrl("/rs/products/suit"), "https://tamir.rs/rs/products/suit")
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = old
  }
})
