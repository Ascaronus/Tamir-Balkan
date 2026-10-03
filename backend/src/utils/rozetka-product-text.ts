/** Stable public handles: Serbian Latin text, ASCII slugs, and no renames on reimport. */
const cyrillic: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ґ: 'g', д: 'd', ђ: 'dj', е: 'e', ё: 'yo', є: 'ye', ж: 'z', з: 'z',
  и: 'i', і: 'i', ї: 'yi', й: 'y', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c',
  џ: 'dz', ш: 's', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', đ: 'dj',
}
export const legacyRozetkaHandle = (handle: string) => /^rozetka-[a-f0-9]{16,20}$/.test(handle)
export function productSlug(title: string): string {
  return title.toLowerCase().replace(/./gu, c => cyrillic[c] ?? c).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110).replace(/-$/, '')
}
export function rozetkaProductText(draft: { title: string; description: string; title_sr: string; description_sr: string }) {
  return { title: draft.title_sr.trim() || draft.title.trim(), description: draft.description_sr.trim() || draft.description }
}
export function rozetkaProductHandle(title: string, key: string, products: { id: string; handle?: string; metadata?: Record<string, any> | null }[], existing?: { id: string; handle?: string }) {
  if (existing?.handle && !legacyRozetkaHandle(existing.handle)) return existing.handle
  const occupied = new Set(products.filter(p => p.id !== existing?.id).flatMap(p => [p.handle, p.metadata?.rozetka_legacy_handle]).filter(Boolean))
  const base = productSlug(title) || `tamir-product-${key.slice(0, 8)}`
  if (!occupied.has(base)) return base
  const unique = `${base}-${key.slice(0, 8)}`
  if (!occupied.has(unique)) return unique
  for (let n = 2; ; n++) if (!occupied.has(`${unique}-${n}`)) return `${unique}-${n}`
}
