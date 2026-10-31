'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocaleContext } from '@/components/i18n/LocaleProvider'
import { medusaStoreLocale } from '@/lib/i18n/config'
import { sdk } from '@/lib/medusa'
import type { Cart } from '@/lib/cart/cart-client'
import { localizeCart, type ProductText } from '@/lib/cart/localized-cart'

export function useLocalizedCart(cart: Cart | null) {
  return useLocalizedCartState(cart).cart
}

export function useLocalizedCartState(cart: Cart | null) {
  const [attempt, setAttempt] = useState(0)
  const { locale } = useLocaleContext()
  const key = `${cart?.id ?? ''}:${locale}:${attempt}`
  const [result, setResult] = useState<{ key: string; products: ProductText[]; resolved: string[]; failed?: string } | null>(null)
  const ids = [...new Set((cart?.items ?? []).flatMap(item => item.product_id ? [item.product_id] : []))].sort()
  const missing = ids.filter(id => result?.key !== key || !result.resolved.includes(id))
  const missingKey = JSON.stringify(missing)
  useEffect(() => {
    const productIds: string[] = JSON.parse(missingKey)
    if (!productIds.length) return
    const controller = new AbortController()
    let active = true
    const batches: string[][] = []
    for (let i = 0; i < productIds.length; i += 50) batches.push(productIds.slice(i, i + 50))
    void Promise.all(batches.map(id => sdk.client.fetch<{ products: ProductText[] }>('/store/products', {
      query: { id, fields: 'id,title,handle,metadata,*variants,*variants.options', limit: id.length },
      headers: { 'x-medusa-locale': medusaStoreLocale(locale) },
      cache: 'no-store', signal: controller.signal,
    }))).then(responses => {
      if (active) setResult(previous => ({ key,
        products: [...(previous?.key === key ? previous.products : []), ...responses.flatMap(response => response.products)],
        resolved: [...(previous?.key === key ? previous.resolved : []), ...productIds],
      }))
    }).catch(() => {
      if (active) setResult(previous => ({ key, products: previous?.key === key ? previous.products : [],
        resolved: previous?.key === key ? previous.resolved : [], failed: missingKey }))
    })
    return () => { active = false; controller.abort() }
  }, [missingKey, key, locale])
  const localized = useMemo(() => localizeCart(cart, result?.key === key ? result.products : [], locale), [cart, result, key, locale])
  const error = missing.length > 0 && result?.key === key && result.failed === missingKey
  const ready = !missing.length || error
  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return useMemo(() => ({ cart: localized, ready, error, retry }), [localized, ready, error, retry])
}
