import { plainText } from './rozetka-preview'

export const translationConfigured = () => Boolean(process.env.GOOGLE_TRANSLATE_API_KEY && process.env.GOOGLE_TRANSLATE_API_KEY !== 'YOUR_GOOGLE_KEY')
export function serbianLatin(text: string) {
  const cyr = 'абвгдђежзијклљмнњопрстћуфхцчџш', lat = ['a', 'b', 'v', 'g', 'd', 'đ', 'e', 'ž', 'z', 'i', 'j', 'k', 'l', 'lj', 'm', 'n', 'nj', 'o', 'p', 'r', 's', 't', 'ć', 'u', 'f', 'h', 'c', 'č', 'dž', 'š']
  return [...text].map(c => { const i = cyr.indexOf(c.toLowerCase()); if (i < 0) return c; const s = lat[i]; return c === c.toLowerCase() ? s : s[0].toUpperCase() + s.slice(1) }).join('')
}
/** One provider for product and option translations. Empty text never incurs a request. */
export async function googleTranslate(texts: string[], target: 'sr' | 'en'): Promise<string[]> {
  if (!translationConfigured()) throw Error('TRANSLATION_NOT_CONFIGURED')
  const unique = [...new Set(texts.filter(text => text.trim()))], translated = new Map<string, string>()
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50)
    const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_TRANSLATE_API_KEY! },
      signal: AbortSignal.timeout(25000), body: JSON.stringify({ q: batch, target, format: 'text' }),
    })
    if (!response.ok) throw Error('TRANSLATION_FAILED')
    const rows = (await response.json())?.data?.translations
    if (!Array.isArray(rows) || rows.length !== batch.length || rows.some(row => typeof row?.translatedText !== 'string' || !row.translatedText.trim())) throw Error('TRANSLATION_FAILED')
    batch.forEach((text, i) => {
      const value = plainText(rows[i].translatedText)
      translated.set(text, target === 'sr' ? serbianLatin(value) : value)
    })
  }
  return texts.map(text => text.trim() ? translated.get(text)! : '')
}
