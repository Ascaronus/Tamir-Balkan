'use client'
import { useEffect, useState } from 'react'
import { useLocaleContext } from '@/components/i18n/LocaleProvider'
import { medusaStoreLocale } from '@/lib/i18n/config'
import { sdk } from '@/lib/medusa'
import type { Cart } from '@/lib/cart/cart-client'
import { localizeCart, type ProductText } from '@/lib/cart/localized-cart'

export function useLocalizedCart(cart: Cart | null) {
  const { locale } = useLocaleContext()
  const ids = JSON.stringify([...new Set((cart?.items ?? []).flatMap(item => item.product_id ? [item.product_id] : []))].sort())
  const key = `${locale}:${ids}`
  const [result, setResult] = useState<{ key: string; products: ProductText[] } | null>(null)
  useEffect(() => {
    const productIds: string[] = JSON.parse(ids)
    if (!productIds.length) return
    const controller = new AbortController()
    let active = true
    const batches: string[][] = []
    for (let i = 0; i < productIds.length; i += 50) batches.push(productIds.slice(i, i + 50))
    void Promise.all(batches.map(id => sdk.client.fetch<{ products: ProductText[] }>('/store/products', {
      query: { id, fields: 'id,title,handle,metadata', limit: id.length },
      headers: { 'x-medusa-locale': medusaStoreLocale(locale) },
      cache: 'no-store', signal: controller.signal,
    }))).then(responses => {
      if (active) setResult({ key, products: responses.flatMap(response => response.products) })
    }).catch(() => { /* Keep usable cart snapshots if a product is unpublished or the lookup fails. */ })
    return () => { active = false; controller.abort() }
  }, [ids, key, locale])
  return localizeCart(cart, result?.key === key ? result.products : [], locale)
}
