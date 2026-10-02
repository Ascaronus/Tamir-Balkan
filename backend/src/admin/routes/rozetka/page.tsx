import { defineRouteConfig } from "@medusajs/admin-sdk"
import { useEffect, useMemo, useRef, useState } from "react"
import { DEFAULT_XML_URL, MAX_XML_BYTES, type ImportSource, draftErrors, initialDraft, numberInput, type ImportDraft, type ImportPreview, type ImportResult, type ImportSettings, type SourceProduct } from "../../../shared/rozetka-import"
import "./rozetka.css"

const STORAGE = "tamir-rozetka-drafts-v1"
type Result = { state: "success" | "error" | "running"; message: string; product_id?: string }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { credentials: "include", cache: "no-store", method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403 ? "Сессия закончилась. Войдите в админку заново." : json.message || "Не удалось выполнить запрос")
    Object.assign(error, { product_id: json.product_id }); throw error
  }
  return json
}
const money = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)
function prices(draft: ImportDraft) {
  const values = draft.variants.filter(v => v.selected).map(v => numberInput(v.price)).filter((v): v is number => v !== null)
  if (!values.length) return "Не задана"
  const min = Math.min(...values), max = Math.max(...values)
  return `${money(min)}${max !== min ? " – " + money(max) : ""} RSD`
}
function categoryPath(id: string, categories: ImportPreview["categories"]) {
  const names: string[] = [], visited = new Set<string>(); let current = categories.find(c => c.id === id)
  while (current && !visited.has(current.id)) { names.unshift(current.name); visited.add(current.id); current = categories.find(c => c.id === current?.parent_category_id) }
  return names.join(" / ")
}

export default function RozetkaImportPage() {
  const [sourceMode, setSourceMode] = useState<"url" | "file">("url")
  const [sourceUrl, setSourceUrl] = useState(DEFAULT_XML_URL)
  const [sourceFile, setSourceFile] = useState<Extract<ImportSource, { type: "file" }> | null>(null)
  const [loadedSource, setLoadedSource] = useState<ImportSource | null>(null)
  const [fileReading, setFileReading] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [drafts, setDrafts] = useState<Record<string, ImportDraft>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [settings, setSettings] = useState<ImportSettings>({ stock_location_id: "", sales_channel_id: "", image_mode: "remote" })
  const [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(""), [notice, setNotice] = useState("")
  const [search, setSearch] = useState(""), [category, setCategory] = useState("")
  const [kind, setKind] = useState("all"), [page, setPage] = useState(0)
  const [editing, setEditing] = useState<string | null>(null), [tab, setTab] = useState("text")
  const [results, setResults] = useState<Record<string, Result>>({})
  const [running, setRunning] = useState(false), [confirming, setConfirming] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [batchCategory, setBatchCategory] = useState(""), [rate, setRate] = useState(""), [markup, setMarkup] = useState("0")
  const [translating, setTranslating] = useState(false)
  const busy = useRef(false), stop = useRef(false), mounted = useRef(true)
  const modal = useRef<HTMLDivElement>(null)
  useEffect(() => {
    mounted.current = true
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "null")
      if (saved?.version === 1 && saved.drafts && typeof saved.drafts === "object") {
        // Only restore this tool's own draft shape. Server validation remains authoritative.
        const valid = Object.entries(saved.drafts).filter(([, d]) => d && typeof d === "object" && Array.isArray((d as ImportDraft).variants) && typeof (d as ImportDraft).fingerprint === "string" && Array.isArray((d as ImportDraft).images))
        setDrafts(Object.fromEntries(valid) as Record<string, ImportDraft>)
      }
    } catch { setNotice("Сохранённые черновики не удалось прочитать. Загрузите товары из источника.") }
    setLoaded(true)
    return () => { mounted.current = false; stop.current = true }
  }, [])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(STORAGE, JSON.stringify({ version: 1, drafts })) }
    catch { setNotice("Браузер не смог сохранить черновики. Не закрывайте страницу до завершения работы.") }
  }, [drafts, loaded])
  useEffect(() => {
    if (!running) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [running])
  useEffect(() => {
    if (!editing && !confirming) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = modal.current
    dialog?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return
      const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length)
      const first = controls[0], last = controls[controls.length - 1]
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    dialog?.addEventListener("keydown", trap)
    return () => { dialog?.removeEventListener("keydown", trap); previous?.focus() }
  }, [editing, confirming])
  function getDraft(product: SourceProduct) { return drafts[product.key] || initialDraft(product) }
  function patch(key: string, change: Partial<ImportDraft>) {
    const product = preview?.products.find(p => p.key === key); if (!product) return
    setDrafts(old => ({ ...old, [key]: { ...(old[key] || initialDraft(product)), ...change } }))
  }
  async function chooseFile(file?: File) {
    setSourceFile(null); setError("")
    if (!file) return
    if (file.size > MAX_XML_BYTES || !file.size) { setError("Выберите непустой XML-файл до 10 МБ."); return }
    setFileReading(true)
    try {
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())
      setSourceFile({ type: "file", name: file.name, xml })
    } catch { setError("Не удалось прочитать файл. Сохраните XML в кодировке UTF-8.") }
    finally { setFileReading(false) }
  }
  async function load() {
    if (busy.current || fileReading || loading) return
    const source: ImportSource | null = sourceMode === "url" ? { type: "url", url: sourceUrl.trim() } : sourceFile
    if (!source) { setError("Сначала выберите XML-файл."); return }
    setLoading(true); setError("")
    try {
      const next = await request<ImportPreview>("/admin/rozetka", source)
      if (!mounted.current) return
      setPreview(next); setLoadedSource(source); setSelected([]); setPage(0)
      setSettings(old => ({ ...old, stock_location_id: next.locations.some(l => l.id === old.stock_location_id) ? old.stock_location_id : next.default_location_id,
        sales_channel_id: next.sales_channels.some(c => c.id === old.sales_channel_id) ? old.sales_channel_id : next.default_sales_channel_id }))
      setNotice("Источник загружен. Ваши правки сохранены; изменившиеся товары помечены для проверки.")
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка загрузки") }
    finally { setLoading(false) }
  }
  const visible = useMemo(() => (preview?.products || []).filter(p => {
    const d = drafts[p.key] || initialDraft(p), q = search.toLowerCase().trim()
    return (!category || p.category_id === category) && (!q || [p.title, d.title, d.title_sr, d.title_en, p.vendor, ...p.variants.map(v => v.sku)].join(" ").toLowerCase().includes(q))
      && (kind === "all" || (kind === "new" && !p.existing) || (kind === "existing" && Boolean(p.existing)) || (kind === "selected" && selected.includes(p.key)) || (kind === "errors" && results[p.key]?.state === "error"))
  }), [preview, drafts, search, category, kind, selected, results])
  const pageCount = Math.max(1, Math.ceil(visible.length / 20)), currentPage = Math.min(page, pageCount - 1)
  const shown = visible.slice(currentPage * 20, (currentPage + 1) * 20)
  const chosen = preview?.products.filter(p => selected.includes(p.key)) || []
  const product = preview?.products.find(p => p.key === editing), draft = product ? getDraft(product) : null
  const categories = preview?.categories || []
  const orderedCategories = [...categories].sort((a, b) => categoryPath(a.id, categories).localeCompare(categoryPath(b.id, categories)))
  function toggle(key: string) { setSelected(old => old.includes(key) ? old.filter(k => k !== key) : [...old, key]) }
  function resetFilters() { setSearch(""); setCategory(""); setKind("all"); setPage(0) }
  function applyBatchCategory() {
    if (!batchCategory || !chosen.length) return
    setDrafts(old => { const next = { ...old }; for (const p of chosen) next[p.key] = { ...(old[p.key] || initialDraft(p)), category_id: batchCategory }; return next })
    setNotice(`Категория назначена: ${chosen.length} товаров. Изменения пока только в предпросмотре.`)
  }
  function applyPrices() {
    const conversion = numberInput(rate), percent = numberInput(markup)
    if (conversion === null || conversion <= 0 || percent === null || percent <= -100 || percent > 10000) { setError("Укажите положительный курс UAH → RSD и наценку больше −100%."); return }
    if (!chosen.length) { setError("Сначала выберите товары для пересчёта цен."); return }
    setDrafts(old => {
      const next = { ...old }
      for (const p of chosen) {
        const d = old[p.key] || initialDraft(p)
        next[p.key] = { ...d, variants: d.variants.map(v => {
          const src = p.variants.find(s => s.id === v.id)
          return v.selected && src?.price != null && ["UAH", "RSD"].includes(src.currency)
            ? { ...v, price: String(Math.round(src.price * (src.currency === "UAH" ? conversion : 1) * (1 + percent / 100) * 100) / 100) } : v
        }) }
      }
      return next
    })
    setError(""); setNotice(`Цены пересчитаны для выбранных товаров. Проверьте итог в RSD перед импортом.`)
  }
  function check() {
    setError("")
    if (!chosen.length) { setError("Выберите товары галочками."); return }
    if (!settings.stock_location_id || !settings.sales_channel_id) { setError("Выберите склад и канал продаж."); return }
    for (const p of chosen) {
      const d = getDraft(p), errors = draftErrors(d)
      if (d.fingerprint !== p.fingerprint || d.existing_id !== p.existing?.id || d.existing_updated_at !== p.existing?.updated_at) errors.unshift("Источник или товар магазина изменился. Нажмите «Принять текущие данные» после проверки.")
      if (errors.length) { setError(`${d.title}: ${errors.join(". ")}`); setEditing(p.key); setTab("text"); return }
    }
    setConfirming(true)
  }
  async function run() {
    if (busy.current || !loadedSource) return
    const queue = chosen.map(p => ({ ...getDraft(p) })), config = { ...settings }
    busy.current = true; stop.current = false; setRunning(true); setConfirming(false); setError(""); setProgress({ done: 0, total: queue.length })
    let succeeded = 0, failed = 0
    try {
      for (const d of queue) {
        if (stop.current || !mounted.current) break
        setResults(old => ({ ...old, [d.key]: { state: "running", message: "Импортируется…" } }))
        try {
          const result = await request<ImportResult>("/admin/rozetka/import", { draft: d, settings: config, source: loadedSource })
          succeeded++
          if (mounted.current) {
            setResults(old => ({ ...old, [d.key]: { state: "success", product_id: result.product_id, message: `${result.action === "replayed" ? "Уже импортирован" : result.action === "created" ? "Создан" : "Обновлён"} · ${result.status === "published" ? "опубликован" : "черновик"}` } }))
            setSelected(old => old.filter(k => k !== d.key))
          }
        } catch (e) {
          failed++
          if (mounted.current) setResults(old => ({ ...old, [d.key]: { state: "error", message: e instanceof Error ? e.message : "Ошибка импорта", product_id: (e as { product_id?: string }).product_id } }))
          // Stop on an error: the user can inspect a partial draft before retrying.
          stop.current = true
        }
        if (mounted.current) setProgress(v => ({ ...v, done: v.done + 1 }))
      }
      if (mounted.current) setNotice(`Завершено: ${succeeded}. Ошибок: ${failed}.${stop.current ? " Очередь остановлена; остальные товары не импортированы." : " Обновите список перед следующим импортом существующих товаров."}`)
    } finally { busy.current = false; if (mounted.current) setRunning(false) }
  }
  async function translate() {
    if (!draft || !product || translating) return
    setTranslating(true); setError("")
    try {
      const result = await request<Pick<ImportDraft, "title_sr" | "title_en" | "description_sr" | "description_en">>("/admin/rozetka/translate", { title: draft.title, description: draft.description })
      patch(product.key, result); setNotice("Автоперевод добавлен в черновик. Проверьте формулировки перед импортом.")
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка перевода") }
    finally { setTranslating(false) }
  }
  function acceptCurrent(p: SourceProduct) {
    const old = getDraft(p), sourceIds = new Set(p.variants.map(v => v.id))
    patch(p.key, { fingerprint: p.fingerprint, existing_id: p.existing?.id, existing_updated_at: p.existing?.updated_at,
      variants: [...old.variants.filter(v => sourceIds.has(v.id)), ...initialDraft(p).variants.filter(v => !old.variants.some(o => o.id === v.id)).map(v => ({ ...v, selected: false }))],
      images: old.images.filter(url => p.images.includes(url)) })
  }
  function variantPatch(id: string, changes: Partial<ImportDraft["variants"][number]>) {
    if (draft && product) patch(product.key, { variants: draft.variants.map(v => v.id === id ? { ...v, ...changes } : v) })
  }
  function closeEditor() { if (!translating) setEditing(null) }
  return <div className="rz-page">
    <header className="rz-header"><div><div className="rz-eyebrow">TAMIR · КАТАЛОГ ПОСТАВЩИКА</div><h1>Импорт Rozetka</h1><p>Выберите товары, подготовьте карточки и перенесите в магазин.</p></div>
      </header>
    <fieldset disabled={running || loading || fileReading} className="rz-source-picker">
      <legend>Источник товаров</legend>
      <div className="rz-source-modes" role="group" aria-label="Способ загрузки XML">
        <button aria-pressed={sourceMode === "url"} className={sourceMode === "url" ? "active" : ""} onClick={() => setSourceMode("url")}>По ссылке</button>
        <button aria-pressed={sourceMode === "file"} className={sourceMode === "file" ? "active" : ""} onClick={() => setSourceMode("file")}>XML-файл</button>
      </div>
      <div className="rz-source-input">
        {sourceMode === "url" ? <label>Адрес XML<input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder={DEFAULT_XML_URL} /><span className="rz-help">HTTPS-ссылка tamir.ua. Можно изменить язык или путь к выгрузке.</span></label>
          : <label>Файл XML<input type="file" accept=".xml,application/xml,text/xml" onChange={e => void chooseFile(e.target.files?.[0])} /><span className="rz-help">{fileReading ? "Читаем файл…" : sourceFile ? `${sourceFile.name} · ${(new Blob([sourceFile.xml]).size / 1024).toFixed(0)} КБ` : "XML/YML в UTF-8, до 10 МБ. После выбора нажмите «Загрузить товары»."}</span></label>}
        <button className="rz-primary" disabled={sourceMode === "file" && !sourceFile} onClick={() => void load()}>{loading ? "Загружаем…" : "Загрузить товары"}</button>
      </div>
      {preview && loadedSource && <p className="rz-loaded-source">Загружен {loadedSource.type === "file" ? "файл" : "адрес"}: <strong>{preview.source}</strong> · {preview.products.length} товаров · {preview.products.reduce((n, p) => n + p.variants.length, 0)} вариантов · {new Date(preview.fetched_at).toLocaleString("ru-RU")}</p>}
      <p className="rz-help">Загрузка открывает предпросмотр. Изменение адреса или выбор другого файла применится после нажатия «Загрузить товары».</p>
    </fieldset>
    {error && <div className="rz-alert rz-error" role="alert">{error}</div>}
    {notice && <div className="rz-alert" role="status">{notice}</div>}
    {running && <div className="rz-progress" role="status"><div><strong>Импорт: {progress.done} из {progress.total}</strong><p>Товары обрабатываются по одному. Не закрывайте страницу.</p></div><progress value={progress.done} max={progress.total} /><button onClick={() => { stop.current = true; setNotice("Остановка после текущего товара…") }}>Остановить очередь</button></div>}
    {!preview ? <section className="rz-empty"><div className="rz-empty-icon">↓</div><h2>Сначала посмотрите, что импортируете</h2><p>Фотографии, цены источника, описания и размеры появятся здесь.<br />Можно выбрать отдельные товары и изменить каждую карточку.</p><p className="rz-help">Выберите ссылку или XML-файл в блоке выше.</p></section> : <>
      <fieldset disabled={running || loading} className="rz-settings"><legend>Куда и как импортировать</legend>
        <label>Склад<select value={settings.stock_location_id} onChange={e => setSettings(s => ({ ...s, stock_location_id: e.target.value }))}><option value="">Выберите склад</option>{preview.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label>Канал продаж<select value={settings.sales_channel_id} onChange={e => setSettings(s => ({ ...s, sales_channel_id: e.target.value }))}><option value="">Выберите канал</option>{preview.sales_channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Хранение фотографий<select value={settings.image_mode} onChange={e => setSettings(s => ({ ...s, image_mode: e.target.value as ImportSettings["image_mode"] }))}><option value="remote">Ссылки на tamir.ua — не занимают диск</option><option value="copy">Копировать фотографии в магазин</option></select></label>
        <p className="rz-help rz-wide">Новые товары создаются черновиками, остатки магазина — 0. Измените их в редакторе при необходимости. Ссылки на фото зависят от доступности tamir.ua.</p>
      </fieldset>
      <div className="rz-layout"><aside className="rz-sidebar"><h2>Категории источника</h2><button className={!category ? "rz-category active" : "rz-category"} disabled={running} onClick={() => { setCategory(""); setPage(0) }}>Все товары <span>{preview.products.length}</span></button>
        {preview.source_categories.filter(c => c.count > 0).map(c => <button key={c.id} className={category === c.id ? "rz-category active" : "rz-category"} disabled={running} onClick={() => { setCategory(c.id); setPage(0) }}>{c.name}<span>{c.count}</span></button>)}
        <p className="rz-help">Категория источника нужна для навигации. Категорию магазина вы назначаете сами.</p></aside>
        <main className="rz-main"><fieldset disabled={running || loading} className="rz-controls"><label className="rz-search">Поиск<input placeholder="Название, артикул, бренд…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} /></label><label>Показать<select value={kind} onChange={e => { setKind(e.target.value); setPage(0) }}><option value="all">Все товары</option><option value="new">Новые</option><option value="existing">Уже в магазине</option><option value="selected">Выбранные</option><option value="errors">С ошибками импорта</option></select></label></fieldset>
          <fieldset disabled={running || loading} className="rz-batch"><div className="rz-batch-head"><strong>Выбрано: {selected.length}</strong><button onClick={() => setSelected(old => [...new Set([...old, ...shown.map(p => p.key)])])}>Выбрать показанные ({shown.length})</button><button disabled={!selected.length} onClick={() => setSelected([])}>Снять выбор</button></div>
            <div className="rz-batch-tools"><label>Категория для выбранных<select value={batchCategory} onChange={e => setBatchCategory(e.target.value)}><option value="">Выберите категорию магазина</option>{orderedCategories.map(c => <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>)}</select></label><button disabled={!batchCategory || !selected.length} onClick={applyBatchCategory}>Назначить</button></div>
            <details><summary>Пересчитать цены выбранных товаров</summary><div className="rz-batch-tools"><label>1 UAH = … RSD<input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="Ваш курс" /></label><label>Наценка, %<input inputMode="decimal" value={markup} onChange={e => setMarkup(e.target.value)} /></label><button disabled={!selected.length} onClick={applyPrices}>Рассчитать в RSD</button></div><p className="rz-help">Формула: цена источника × курс × (1 + наценка / 100). Для исходных RSD курс не применяется. Перезаписывает цены выбранных вариантов в предпросмотре.</p></details>
          </fieldset>
          <div className="rz-table-wrap"><table className="rz-table"><thead><tr><th><span className="rz-sr-only">Выбор</span></th><th>Товар и источник</th><th>Категория магазина</th><th>Цена / варианты</th><th>Состояние</th><th><span className="rz-sr-only">Редактирование</span></th></tr></thead><tbody>{shown.map(p => {
            const d = getDraft(p), result = results[p.key], stale = d.fingerprint !== p.fingerprint || d.existing_id !== p.existing?.id || d.existing_updated_at !== p.existing?.updated_at
            return <tr key={p.key} className={selected.includes(p.key) ? "rz-selected" : ""}><td><input type="checkbox" aria-label={`Выбрать ${d.title}`} checked={selected.includes(p.key)} disabled={running} onChange={() => toggle(p.key)} /></td>
              <td><div className="rz-product-cell">{d.images[0] ? <img src={d.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="rz-no-photo">Нет фото</div>}<div><button className="rz-title" disabled={running} onClick={() => { setEditing(p.key); setTab("text") }}>{d.title}</button><p>{p.category_name} · {p.vendor || "Без бренда"}</p><p className="rz-help">Источник: {p.variants[0]?.price != null ? `${money(p.variants[0].price)} ${p.variants[0].currency}` : "цена не указана"}{p.variants.length > 1 ? " · по вариантам" : ""}</p></div></div></td>
              <td>{categoryPath(d.category_id, categories) || <span className="rz-warning">Не назначена</span>}</td><td><strong>{prices(d)}</strong><p>{d.variants.filter(v => v.selected).length} из {d.variants.length} вариантов · {d.images.length} фото</p></td>
              <td><span className={`rz-badge ${p.existing ? "existing" : ""}`}>{p.existing ? "В магазине" : "Новый"}</span>{stale && <p className="rz-warning">Нужна сверка изменений</p>}{p.warnings.length > 0 && <p className="rz-help">Замечаний: {p.warnings.length}</p>}{result && <p className={result.state === "error" ? "rz-warning" : "rz-help"}>{result.message}{result.product_id && <> · <a href={`/app/products/${encodeURIComponent(result.product_id)}`} target="_blank" rel="noreferrer">Открыть товар</a></>}</p>}</td>
              <td><button disabled={running} onClick={() => { setEditing(p.key); setTab("text") }}>Редактировать</button></td></tr>
          })}</tbody></table>{!shown.length && <div className="rz-empty-small">Нет товаров по этим условиям. <button onClick={resetFilters}>Сбросить фильтры</button></div>}</div>
          <div className="rz-pagination"><span>{visible.length} товаров · страница {currentPage + 1} из {pageCount}</span><button disabled={currentPage === 0 || running} onClick={() => setPage(currentPage - 1)}>← Назад</button><button disabled={currentPage + 1 >= pageCount || running} onClick={() => setPage(currentPage + 1)}>Далее →</button></div>
        </main></div>
      <footer className="rz-actionbar"><div><strong>К импорту: {selected.length} товаров</strong><p>Правки сохраняются в этом браузере. В магазин попадут только выбранные позиции.</p></div><button className="rz-primary" disabled={running || loading || !selected.length} onClick={check}>Проверить и импортировать →</button></footer>
    </>}
    {product && draft && <div className="rz-overlay"><div className="rz-dialog" role="dialog" aria-modal="true" aria-labelledby="rz-editor-title" tabIndex={-1} ref={modal} onKeyDown={e => { if (e.key === "Escape") closeEditor() }}>
      <header className="rz-dialog-header"><div><div className="rz-eyebrow">ПОДГОТОВКА ТОВАРА</div><h2 id="rz-editor-title">{draft.title || product.title}</h2></div><button disabled={translating} aria-label="Закрыть редактор" onClick={closeEditor}>✕</button></header>
      <div className="rz-tabs" role="tablist" aria-label="Редактор товара">{[["text", "Описание"], ["variants", `Варианты (${draft.variants.length})`], ["images", `Фото (${draft.images.length})`], ["source", "Оригинал"]].map(([key, label]) => <button role="tab" aria-selected={tab === key} key={key} disabled={translating} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</div>
      <div className="rz-dialog-body">{error && <div role="alert" className="rz-alert rz-error">{error}</div>}
        {(draft.fingerprint !== product.fingerprint || draft.existing_id !== product.existing?.id || draft.existing_updated_at !== product.existing?.updated_at) && <div className="rz-alert rz-stale">Данные источника или магазина изменились. Сравните их с вашими правками во вкладке «Оригинал».<button onClick={() => acceptCurrent(product)}>Принять текущие данные, сохранив правки</button></div>}
        {product.existing && <div className="rz-alert">Уже в магазине: <a href={`/app/products/${encodeURIComponent(product.existing.id)}`} target="_blank" rel="noreferrer">{product.existing.title}</a>. Обновление заменит название, описание, переводы, категорию, фото и цены выбранных вариантов данными этого редактора. Другие варианты и товары остаются без изменений.<label className="rz-check"><input type="checkbox" checked={draft.mode === "update"} onChange={e => patch(product.key, { mode: e.target.checked ? "update" : "create" })} />Разрешить обновление этого товара</label></div>}
        <fieldset disabled={translating || running} className="rz-editor-fields">
        {tab === "text" && <><div className="rz-fields"><label className="rz-wide">Название<input maxLength={255} value={draft.title} onChange={e => patch(product.key, { title: e.target.value })} /></label><label>Категория магазина<select value={draft.category_id} onChange={e => patch(product.key, { category_id: e.target.value })}><option value="">Выберите категорию</option>{orderedCategories.map(c => <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}</option>)}</select></label><label>После импорта<select value={draft.status} onChange={e => patch(product.key, { status: e.target.value as ImportDraft["status"] })}><option value="draft">Черновик — не показывать покупателям</option><option value="published">Опубликовать в магазине</option></select></label><label className="rz-wide">Описание<textarea rows={8} maxLength={20000} value={draft.description} onChange={e => patch(product.key, { description: e.target.value })} /></label></div>
          <div className="rz-section-head"><h3>Переводы для витрины</h3><button disabled={!preview?.translation_available} onClick={() => void translate()}>{translating ? "Переводим…" : "Автоперевод SR + EN"}</button></div><p className="rz-help">{preview?.translation_available ? "Автоперевод отправляет название и описание в Google Translate и заменяет поля SR/EN. Тариф вашего Google Cloud." : "Автоперевод не настроен на сервере. Переводы можно ввести вручную."} Пустой перевод использует основной текст.</p>
          <div className="rz-fields"><label>Название · SR (латиница)<input maxLength={255} value={draft.title_sr} onChange={e => patch(product.key, { title_sr: e.target.value })} /></label><label>Название · EN<input maxLength={255} value={draft.title_en} onChange={e => patch(product.key, { title_en: e.target.value })} /></label><label>Описание · SR<textarea rows={5} maxLength={20000} value={draft.description_sr} onChange={e => patch(product.key, { description_sr: e.target.value })} /></label><label>Описание · EN<textarea rows={5} maxLength={20000} value={draft.description_en} onChange={e => patch(product.key, { description_en: e.target.value })} /></label><label>Бренд<input maxLength={255} value={draft.vendor} onChange={e => patch(product.key, { vendor: e.target.value })} /></label><label>Материал<input maxLength={255} value={draft.material} onChange={e => patch(product.key, { material: e.target.value })} /></label><label>Вес, г<input inputMode="decimal" value={draft.weight} onChange={e => patch(product.key, { weight: e.target.value })} /></label><label>Страна производства (UA, RS…)<input maxLength={2} value={draft.origin_country} onChange={e => patch(product.key, { origin_country: e.target.value.toUpperCase() })} /></label></div></>}
        {tab === "variants" && <><p className="rz-help">Цена магазина — в RSD. Остаток магазина задайте по фактическому наличию на выбранном складе. Невыбранные варианты не импортируются.</p><button onClick={() => patch(product.key, { variants: draft.variants.map(v => ({ ...v, stock: String(product.variants.find(s => s.id === v.id)?.stock || 0) })) })}>Подставить остатки источника</button><div className="rz-variants">{draft.variants.map(v => { const src = product.variants.find(s => s.id === v.id); return <div className="rz-variant" key={v.id}><label className="rz-check"><input type="checkbox" checked={v.selected} onChange={e => variantPatch(v.id, { selected: e.target.checked })} />Импортировать вариант</label><div className="rz-fields"><label>Размер<input maxLength={255} value={v.size} onChange={e => variantPatch(v.id, { size: e.target.value })} /></label><label>Цвет (необязательно)<input maxLength={255} value={v.color} onChange={e => variantPatch(v.id, { color: e.target.value })} /></label><label className="rz-wide">SKU / артикул<input maxLength={255} value={v.sku} onChange={e => variantPatch(v.id, { sku: e.target.value })} /></label><label>Цена магазина, RSD<input inputMode="decimal" value={v.price} onChange={e => variantPatch(v.id, { price: e.target.value })} /><span className="rz-help">Источник: {src?.price ?? "—"} {src?.currency}</span></label><label>Остаток магазина, шт.<input inputMode="numeric" value={v.stock} onChange={e => variantPatch(v.id, { stock: e.target.value })} /><span className="rz-help">Источник: {src?.stock ?? "—"} шт. · {src?.available ? "доступен" : "недоступен"}</span></label></div></div> })}</div></>}
        {tab === "images" && <><p className="rz-help">Выберите фотографии. Первая выбранная — обложка. Кнопка «Обложка» переместит фотографию на первое место.</p><div className="rz-gallery">{product.images.map((url, index) => { const selectedImage = draft.images.includes(url); return <article className={selectedImage ? "selected" : ""} key={url}><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Фото ${index + 1}`} loading="lazy" referrerPolicy="no-referrer" /></a><label className="rz-check"><input type="checkbox" checked={selectedImage} onChange={() => patch(product.key, { images: selectedImage ? draft.images.filter(x => x !== url) : [...draft.images, url] })} />Фото {index + 1}{draft.images[0] === url ? " · обложка" : ""}</label><button onClick={() => patch(product.key, { images: [url, ...draft.images.filter(x => x !== url)] })}>Обложка</button>{selectedImage && <div className="rz-image-order"><button aria-label={`Фото ${index + 1}: раньше`} disabled={draft.images.indexOf(url) === 0} onClick={() => { const items = [...draft.images], i = items.indexOf(url); [items[i - 1], items[i]] = [items[i], items[i - 1]]; patch(product.key, { images: items }) }}>←</button><span>№ {draft.images.indexOf(url) + 1}</span><button aria-label={`Фото ${index + 1}: позже`} disabled={draft.images.indexOf(url) === draft.images.length - 1} onClick={() => { const items = [...draft.images], i = items.indexOf(url); [items[i], items[i + 1]] = [items[i + 1], items[i]]; patch(product.key, { images: items }) }}>→</button></div>}</article> })}</div>{!product.images.length && <p>В источнике нет фотографий. Их можно добавить в обычной карточке товара после импорта черновика.</p>}</>}
        {tab === "source" && <><a href={product.url} target="_blank" rel="noreferrer">Открыть товар на tamir.ua ↗</a><h3>{product.title}</h3><p className="rz-help">{product.category_name} · {product.vendor}</p><p className="rz-source-description">{product.description}</p>{product.warnings.map(w => <p className="rz-warning" key={w}>{w}</p>)}<h3>Параметры источника</h3><dl className="rz-params">{product.variants[0]?.params.map((p, i) => <div key={i}><dt>{p.name}</dt><dd>{p.value}</dd></div>)}</dl></>}
        </fieldset>
      </div><footer className="rz-dialog-footer"><span>{prices(draft)} · {draft.variants.filter(v => v.selected).length} вариантов · {draft.images.length} фото</span><button disabled={translating} onClick={closeEditor}>Готово — сохранить правки</button></footer>
    </div></div>}
    {confirming && <div className="rz-overlay"><div className="rz-dialog rz-confirm" role="dialog" aria-modal="true" aria-labelledby="rz-confirm-title" tabIndex={-1} ref={modal} onKeyDown={e => { if (e.key === "Escape") setConfirming(false) }}><header className="rz-dialog-header"><h2 id="rz-confirm-title">Проверка перед импортом</h2><button aria-label="Закрыть проверку" onClick={() => setConfirming(false)}>✕</button></header><div className="rz-dialog-body"><p>Склад: <strong>{preview?.locations.find(l => l.id === settings.stock_location_id)?.name}</strong></p><p>Канал: <strong>{preview?.sales_channels.find(c => c.id === settings.sales_channel_id)?.name}</strong> · Фото: {settings.image_mode === "remote" ? "ссылки на tamir.ua" : "копирование в магазин"}</p><p className="rz-help">Импортируются только перечисленные товары и выбранные варианты. При ошибке очередь остановится, незавершённый товар останется черновиком.</p><ul className="rz-confirm-list">{chosen.map(p => { const d = getDraft(p); return <li key={p.key}><strong>{d.title}</strong><span>{categoryPath(d.category_id, categories)} · {prices(d)}</span><span>{d.variants.filter(v => v.selected).length} вариантов · {d.images.length} фото · {d.mode === "update" ? "Обновить" : "Создать"} · {d.status === "published" ? "ОПУБЛИКОВАТЬ" : "Черновик"}</span></li> })}</ul></div><footer className="rz-dialog-footer"><button onClick={() => setConfirming(false)}>Вернуться к правкам</button><button className="rz-primary" onClick={() => void run()}>Импортировать {chosen.length} товаров</button></footer></div></div>}
  </div>
}
export const config = defineRouteConfig({ label: "Импорт Rozetka" })
