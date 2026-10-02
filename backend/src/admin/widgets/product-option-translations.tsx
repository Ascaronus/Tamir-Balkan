import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useRef, useState } from "react"
import { cellKey, optionLocales, optionTranslationPayload, optionTranslationRows, translationDraft, type Option } from "../lib/option-translations"

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { credentials: "include", cache: "no-store", method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
  if (!res.ok) throw Error(res.status === 401 || res.status === 403 ? "AUTH_REQUIRED" : "REQUEST_FAILED")
  return res.json()
}
function loadOptions(id: string) {
  return request<{ product: { options: Option[] } }>(`/admin/products/${encodeURIComponent(id)}?fields=id,*options,*options.values,*options.translations,*options.values.translations`)
}
export default function ProductOptionTranslations({ data }: DetailWidgetProps<AdminProduct>) {
  const [options, setOptions] = useState<Option[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [baseline, setBaseline] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const currentId = useRef(data.id)
  currentId.current = data.id
  function apply(next: Option[]) {
    const values = translationDraft(optionTranslationRows(next))
    setOptions(next); setDraft(values); setBaseline(values)
  }
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(""); setSaved(false); setOptions([]); setDraft({}); setBaseline({})
    loadOptions(data.id).then(({ product }) => { if (!cancelled) apply(product.options ?? []) })
      .catch(() => { if (!cancelled) setError("Не удалось загрузить переводы. Обновите страницу и проверьте вход в админку.") })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [data.id, data.updated_at, revision])
  const dirty = Object.keys(draft).some(key => draft[key] !== baseline[key])
  async function save() {
    if (lock.current || loading || !dirty) return
    lock.current = true; setSaving(true); setError(""); setSaved(false)
    const id = data.id
    try {
      const fresh = await loadOptions(id)
      const payload = optionTranslationPayload(optionTranslationRows(fresh.product.options ?? []), baseline, draft)
      if (payload.create.length || payload.update.length) await request("/admin/translations/batch", payload)
      const result = await loadOptions(id)
      if (currentId.current === id) { apply(result.product.options ?? []); setSaved(true) }
    } catch (e) {
      if (currentId.current === id) setError(e instanceof Error && ["TRANSLATION_CHANGED", "OPTION_CHANGED"].includes(e.message)
        ? "Данные уже изменились. Скопируйте свой текст, нажмите «Обновить» и повторите изменение."
        : "Не удалось сохранить переводы. Ваш текст сохранён в полях — попробуйте ещё раз.")
    } finally { lock.current = false; setSaving(false) }
  }
  return <Container id="option-translations" className="p-0">
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <Heading level="h2">Переводы опций · SR / EN</Heading>
      <Button variant="secondary" size="small" disabled={loading || saving} onClick={() => { if (!dirty || window.confirm("Отменить несохранённые изменения и загрузить переводы заново?")) setRevision(n => n + 1) }}>Обновить</Button>
    </div>
    <div className="border-t border-ui-border-base px-6 py-4">
      <Text className="text-ui-fg-subtle">Здесь переводятся названия опций и их значения — подписи цветов и размеров в карточках и фильтрах. Название варианта редактируется отдельно.</Text>
      <Text className="mt-2 text-ui-fg-subtle">SR использует локаль sr-RS, EN — en. Пустое поле означает исходное значение. Переводы сохраняются в стандартной базе Medusa; повторно создавать опции не нужно.</Text>
      {loading ? <Text className="mt-4">Загрузка…</Text> : <form noValidate onSubmit={e => { e.preventDefault(); void save() }}>
        <fieldset disabled={saving} className="min-w-0 border-0 p-0">
          {options.map(option => <section key={option.id} className="mt-6 border-t border-ui-border-base pt-4">
            <Heading level="h3">{option.title}</Heading>
            {optionTranslationRows([option]).map(row => <div key={row.id} className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">
              <div className="min-w-0"><Text className="text-ui-fg-subtle">{row.field === "title" ? "Название опции · оригинал" : "Значение · оригинал"}</Text><Text className="break-words font-medium">{row.original}</Text></div>
              {optionLocales.map(({ code, label }) => <div key={code} className="min-w-0">
                <Label htmlFor={cellKey(row.id, code)}>{label}</Label>
                <Input id={cellKey(row.id, code)} className="mt-1" value={draft[cellKey(row.id, code)] ?? ""} maxLength={255} placeholder={row.original} onChange={e => { setDraft(prev => ({ ...prev, [cellKey(row.id, code)]: e.target.value })); setSaved(false) }} />
              </div>)}
            </div>)}
          </section>)}
          {!options.length && !error && <Text className="mt-4">Сначала добавьте опции и значения товара в разделе «Опции».</Text>}
          <Button className="mt-6" type="submit" disabled={!dirty || saving || !options.length}>{saving ? "Сохранение…" : "Сохранить переводы"}</Button>
        </fieldset>
      </form>}
      {error && <Text role="alert" className="mt-4 text-ui-fg-error">{error}</Text>}
      {saved && <Text role="status" className="mt-4 text-ui-fg-success">Переводы сохранены. Обновите страницу магазина, чтобы увидеть изменения.</Text>}
    </div>
  </Container>
}
export const config = defineWidgetConfig({ zone: "product.details.after" })
