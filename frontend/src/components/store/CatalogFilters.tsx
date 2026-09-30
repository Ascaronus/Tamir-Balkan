"use client"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "@/components/i18n/LocaleProvider"
import { catalogParams, colorSwatch, type CatalogResult, type CatalogSelection, type Facet } from "@/lib/store/catalog"
import { CategoryNavigation } from "./CategoryNavigation"
import { DesignIcon } from "./DesignIcon"

function available(facets: Facet[], selected: string[]) {
  return [...facets, ...selected.filter(value => !facets.some(f => f.value === value)).map(value => ({ value, label: value, count: 0 }))]
}
function FilterForm({ filters, selection, onApply }: { filters: CatalogResult["filters"]; selection: CatalogSelection; onApply?: () => void }) {
  const t = useTranslations()
  const router = useRouter()
  const [error, setError] = useState(false)
  return <form className="filter-form" onSubmit={event => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const min = String(data.get("min_price") || "").trim(), max = String(data.get("max_price") || "").trim()
    const valid = (s: string) => !s || /^\d+(?:[.,]\d{1,4})?$/.test(s)
    if (!valid(min) || !valid(max) || (min && max && Number(min.replace(",", ".")) > Number(max.replace(",", ".")))) { setError(true); return }
    setError(false)
    const next = { ...selection, size: data.getAll("size").map(String), color: data.getAll("color").map(String), min_price: min, max_price: max, page: 1 }
    router.push(`/rs/catalog?${catalogParams(next)}`, { scroll: false }); onApply?.()
  }}>
    <h2 className="filter-heading">{t("sidebar.title")}</h2><CategoryNavigation activeId={selection.category_id} onNavigate={onApply} />
    <fieldset><legend>{t("design.color")}</legend><div className="flex flex-wrap gap-1">
      {available(filters.colors, selection.color).map(item => {
        const color = colorSwatch(item.label) || colorSwatch(item.value)
        return <label key={item.value} className="catalog-color-choice"><input type="checkbox" name="color" value={item.value} defaultChecked={selection.color.includes(item.value)} />{color && <span className="color-dot" aria-hidden="true" style={{ backgroundColor: color }} />}<span>{item.label}</span><span className="sr-only"> ({item.count})</span></label>
      })}
      {!filters.colors.length && !selection.color.length && <p className="text-xs text-[var(--store-text-muted)]">{t("design.noOptions")}</p>}
    </div></fieldset>
    <fieldset><legend>{t("design.size")}</legend><div className="flex flex-wrap gap-2">{available(filters.sizes, selection.size).map(item => <label key={item.value} className="text-choice"><input type="checkbox" name="size" value={item.value} defaultChecked={selection.size.includes(item.value)} /><span className="size-chip">{item.label}</span></label>)}{!filters.sizes.length && !selection.size.length && <p className="text-xs text-[var(--store-text-muted)]">{t("design.noOptions")}</p>}</div></fieldset>
    <fieldset><legend>{t("design.price")} · {filters.price.currency_code.toUpperCase()}</legend><div className="grid grid-cols-2 gap-2"><label>{t("design.from")}<input name="min_price" inputMode="decimal" defaultValue={selection.min_price} placeholder={String(filters.price.min ?? 0)} /></label><label>{t("design.to")}<input name="max_price" inputMode="decimal" defaultValue={selection.max_price} placeholder={filters.price.max === null ? "—" : String(filters.price.max)} /></label></div></fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{t("design.priceError")}</p>}
    <button className="button-primary w-full" type="submit">{t("design.apply")}</button>
    <button className="button-quiet w-full" type="button" onClick={() => { router.push(`/rs/catalog?${catalogParams({ ...selection, size: [], color: [], min_price: "", max_price: "", page: 1 })}`, { scroll: false }); onApply?.() }}>{t("design.reset")}</button>
  </form>
}
export function CatalogFilters({ filters, selection }: { filters: CatalogResult["filters"]; selection: CatalogSelection }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const t = useTranslations()
  const key = catalogParams(selection).toString()
  return <>
    <aside className="catalog-filter-desktop"><FilterForm key={key} filters={filters} selection={selection} /></aside>
    <button className="button-secondary catalog-filter-toggle" type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}><DesignIcon name="filter" />{t("design.filters")}{selection.size.length + selection.color.length > 0 && <span>({selection.size.length + selection.color.length})</span>}</button>
    <dialog ref={dialog} className="filter-drawer" aria-label={t("design.filters")}><div className="flex items-center justify-between pb-6"><h2 className="text-2xl font-semibold">{t("design.filters")}</h2><button className="icon-button" type="button" aria-label={t("common.close")} onClick={() => dialog.current?.close()}><DesignIcon name="close" /></button></div><FilterForm key={key} filters={filters} selection={selection} onApply={() => dialog.current?.close()} /></dialog>
  </>
}
