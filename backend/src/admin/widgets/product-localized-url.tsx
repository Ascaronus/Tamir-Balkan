import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProduct, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

type Result = { handle: string; ready: boolean; title: string }
export default function ProductLocalizedUrl({ data }: DetailWidgetProps<AdminProduct>) {
  const [result, setResult] = useState<Result | null>(null)
  const [handle, setHandle] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const path = `/admin/products/${encodeURIComponent(data.id)}/localized-url`
  async function request(value?: string) {
    const response = await fetch(path, { credentials: "include", cache: "no-store", method: value === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify({ handle: value }) }) })
    const body = await response.json()
    if (!response.ok) throw Error(body.message || "Не удалось загрузить адрес")
    return body as Result
  }
  useEffect(() => {
    let active = true
    request().then(value => { if (active) { setResult(value); setHandle(value.handle) } }).catch(error => { if (active) setMessage(error.message) })
    return () => { active = false }
    // Refresh after native product/translation edits without overwriting an in-progress slug edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id])
  return <Container className="flex flex-col gap-y-4">
    <Heading level="h2">Английская версия · URL</Heading>
    <Text className="text-ui-fg-subtle">Один товар и общий остаток для SR и EN. Сербский адрес остаётся прежним.</Text>
    <Label htmlFor="product-en-handle">Английский адрес товара</Label>
    <Input id="product-en-handle" value={handle} onChange={event => setHandle(event.target.value)} placeholder="mens-burgundy-winter-hat" disabled={!result || busy} />
    <Text className="text-ui-fg-subtle break-all">/en/products/{handle || "…"}</Text>
    {result && <Text className={result.ready ? "text-ui-fg-subtle" : "text-ui-fg-error"}>{result.ready ? "Название и описание EN заполнены." : "Нет полного перевода EN. Заполните английское название и описание в переводах товара. До этого EN-страница не включается в sitemap."}</Text>}
    <Text className="text-ui-fg-subtle">Адрес создаётся из английского названия. Повторный импорт и изменение названия не меняют его. После сохранения нового адреса старая ссылка перенаправляет на него.</Text>
    {message && <Text role="status">{message}</Text>}
    <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setMessage(""); try { const value = await request(); setResult(value); setHandle(value.handle) } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка") } finally { setBusy(false) } }}>Обновить из переводов</Button>
    <Button disabled={!result || busy || !handle.trim() || handle.trim() === result.handle} isLoading={busy} onClick={async () => { setBusy(true); setMessage(""); try { const value = await request(handle.trim()); setResult(value); setHandle(value.handle); setMessage("Адрес сохранён. Старые ссылки продолжают работать.") } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка") } finally { setBusy(false) } }}>Сохранить адрес</Button></div>
  </Container>
}
export const config = defineWidgetConfig({ zone: "product.details.after" })
