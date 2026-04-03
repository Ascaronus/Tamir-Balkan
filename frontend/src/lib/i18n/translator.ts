import type { Messages } from "@/lib/i18n/messages"

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>
) => string

export function createTranslator(messages: Messages): TranslateFn {
  return (key, vars) => {
    const parts = key.split(".")
    let cur: unknown = messages
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p]
      } else {
        return key
      }
    }
    let s = typeof cur === "string" ? cur : key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
      }
    }
    return s
  }
}
