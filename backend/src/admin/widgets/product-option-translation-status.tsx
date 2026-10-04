import { defineWidgetConfig } from '@medusajs/admin-sdk'
import { Button, Container, Heading, Text } from '@medusajs/ui'
import { useEffect, useState } from 'react'
import { missingOptionTranslations, type Option } from '../lib/option-translations'

type MissingProduct = { id: string; title: string; missing: Record<'sr-RS' | 'en', number> }
export default function ProductOptionTranslationStatus() {
  const [products, setProducts] = useState<MissingProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setPage(0)
    async function load() {
      const missing: MissingProduct[] = []
      for (let offset = 0; ; offset += 100) {
        const params = new URLSearchParams({ limit: '100', offset: String(offset), order: 'id',
          fields: 'id,title,*options,*options.values,*options.translations,*options.values.translations' })
        const response = await fetch(`/admin/products?${params}`, { credentials: 'include', cache: 'no-store' })
        if (!response.ok) throw Error('Не удалось проверить переводы опций. Повторите проверку.')
        const result = await response.json() as { products: { id: string; title: string; options: Option[] }[]; count: number }
        if (cancelled) return
        for (const product of result.products) {
          const status = missingOptionTranslations(product.options ?? [])
          if (status['sr-RS'] || status.en) missing.push({ id: product.id, title: product.title, missing: status })
        }
        if (offset + result.products.length >= result.count || result.products.length < 100) break
      }
      if (!cancelled) setProducts(missing)
    }
    load().catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Не удалось проверить переводы.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [revision])
  return <Container className="p-0">
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <Heading level="h2">Переводы опций · SR / EN</Heading>
      <Button size="small" variant="secondary" disabled={loading} onClick={() => setRevision(n => n + 1)}>Проверить заново</Button>
    </div>
    <div className="border-t border-ui-border-base px-6 py-4">
      {loading ? <Text>Проверяем переводы опций…</Text> : error ? <Text role="alert" className="text-ui-fg-error">{error}</Text> : products.length ? <>
        <Text className="text-ui-fg-error">Нет переводов опций: {products.length} товаров</Text>
        <Text className="mt-1 text-ui-fg-subtle">Указано количество пустых полей SR/EN. Откройте товар, выполните автоперевод и сохраните результат.</Text>
        <ul className="mt-3 divide-y divide-ui-border-base">
          {products.slice(page * 10, (page + 1) * 10).map(product => <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <a className="text-ui-fg-interactive hover:underline" href={`/app/products/${encodeURIComponent(product.id)}#option-translations`}>{product.title}</a>
            <Text className="text-ui-fg-subtle">SR: {product.missing['sr-RS']} · EN: {product.missing.en}</Text>
          </li>)}
        </ul>
        {products.length > 10 && <div className="mt-3 flex items-center gap-3">
          <Button size="small" variant="secondary" disabled={!page} onClick={() => setPage(n => n - 1)}>Назад</Button>
          <Text>{page + 1} / {Math.ceil(products.length / 10)}</Text>
          <Button size="small" variant="secondary" disabled={(page + 1) * 10 >= products.length} onClick={() => setPage(n => n + 1)}>Далее</Button>
        </div>}
      </> : <Text className="text-ui-fg-success">Переводы всех опций и значений SR/EN заполнены.</Text>}
    </div>
  </Container>
}
export const config = defineWidgetConfig({ zone: 'product.list.before' })
