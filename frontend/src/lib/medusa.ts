import Medusa from "@medusajs/js-sdk"

/** Fetch/Headers требуют ASCII; кириллица в URL из .env даёт ByteString error при сборке. */
function assertAsciiUrl(label: string, value: string): string {
  const v = value.trim()
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i)
    if (c > 0x7f) {
      throw new Error(
        `${label} must be ASCII only (Latin URL). Non-ASCII at index ${i} (U+${c.toString(16)}). Retype the value in .env — no Cyrillic lookalikes.`
      )
    }
  }
  return v
}

const MEDUSA_BACKEND_URL = assertAsciiUrl(
  "NEXT_PUBLIC_MEDUSA_BACKEND_URL",
  process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ?? "http://localhost:9000"
)

export const sdk = new Medusa({
  baseUrl: MEDUSA_BACKEND_URL,
  debug: process.env.NODE_ENV === "development",
  publishableKey: process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

