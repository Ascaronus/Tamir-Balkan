"use client"
import { useEffect, useState } from "react"
import { getVariantStock } from "./cart-client"

/** Refresh on entry, cart changes and window focus; discard responses for an old cart/variant. */
export function useVariantStock(ids: string[], salesChannelId?: string | null, revision = "") {
  const key = JSON.stringify([[...new Set(ids)].sort(), salesChannelId ?? null, revision])
  const [snapshot, setSnapshot] = useState<{ key: string; limits: Record<string, number | null> } | null>(null)
  useEffect(() => {
    const [variants, channel] = JSON.parse(key) as [string[], string | null, string]
    let active = true, controller: AbortController | undefined
    const refresh = () => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      void getVariantStock(variants, channel, request.signal).then(limits => {
        if (active && !request.signal.aborted) setSnapshot({ key, limits })
      }).catch(() => {
        if (active && !request.signal.aborted) setSnapshot(null)
      })
    }
    refresh()
    window.addEventListener("focus", refresh)
    return () => { active = false; controller?.abort(); window.removeEventListener("focus", refresh) }
  }, [key])
  return snapshot?.key === key ? snapshot.limits : {}
}
