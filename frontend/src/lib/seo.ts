export function siteUrl(path = "/"): string {
  const base = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://tamir.rs")
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid site URL")
  return new URL(path, base.origin).href
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}
