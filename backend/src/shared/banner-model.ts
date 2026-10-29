export type BannerLocale = 'sr' | 'en'
export type BannerText = { title: string; subtitle: string; description: string; alt: string; primaryLabel: string; primaryUrl: string; secondaryLabel: string; secondaryUrl: string }
export type Banner = { id: string; name: string; active: boolean; desktop: string; mobile: string; align: 'left'|'center'|'right'; tone: 'dark'|'light'; gradient: number; fit: 'contain'|'cover'; texts: Record<BannerLocale,BannerText>; updatedAt: string }
export type Carousel = { banners: Banner[]; autoplay: boolean; interval: number }
export const intervals = [3000,4000,5000,6000,8000,10000,15000]
export const emptyText = (): BannerText => ({title:'',subtitle:'',description:'',alt:'',primaryLabel:'',primaryUrl:'',secondaryLabel:'',secondaryUrl:''})
export const initialCarousel: Carousel = {autoplay:true,interval:6000,banners:[{
 id:'banner_original',name:'Winter collection',active:true,desktop:'/design/tamir-family-winter.webp',mobile:'',align:'left',tone:'dark',gradient:34,fit:'contain',updatedAt:'2026-10-27T00:00:00.000Z',
 texts:{sr:{...emptyText(),title:'Toplina koja nas spaja',subtitle:'Za hladne dane i tople trenutke.',alt:'Porodica u pletenim kapama i šalovima tokom zimske šetnje kraj Dunava.',primaryLabel:'Istražite kolekciju',primaryUrl:'#catalog-products'},en:{...emptyText(),title:'Warmth that brings us together',subtitle:'For cold days and warm moments.',alt:'A family in knitted hats and scarves on a winter walk by the Danube.',primaryLabel:'Explore the collection',primaryUrl:'#catalog-products'}}
}]}
export function safeBannerUrl(value: string): boolean {
 if (!value || /[\s\\<>\u0000-\u001f\u007f]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return false
 if (value.startsWith('#')) return /^#[a-zA-Z][\w-]*$/.test(value)
 if (value.startsWith('/') && !value.startsWith('//')) return true
 try { const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password } catch { return false }
}
export function carouselInput(value: unknown, publish=false): Carousel {
 const fail=(message:string):never=>{throw new Error(message)}
 if (!value || typeof value!=='object') return fail('Invalid carousel')
 const c=value as Carousel
 if(typeof c.autoplay!=='boolean'||!intervals.includes(c.interval)||!Array.isArray(c.banners)||c.banners.length>1000) return fail('Invalid carousel settings (maximum 1000 banners)')
 const ids=new Set<string>()
 const banners=c.banners.map(b=>{
  if(!b || typeof b.id!=='string'||!/^banner_[\w-]{1,80}$/.test(b.id)||ids.has(b.id)) return fail('Invalid or duplicate banner ID');ids.add(b.id)
  if(typeof b.active!=='boolean'||!['left','center','right'].includes(b.align)||!['dark','light'].includes(b.tone)||!['cover','contain'].includes(b.fit)||!Number.isFinite(b.gradient)||b.gradient<0||b.gradient>100)return fail('Invalid display settings')
  const clean=(v:unknown,max:number)=>{if(typeof v!=='string'||v.length>max||/[<>\u0000-\u0008]/.test(v))return fail('Use plain text within the allowed length');return v.trim()}
  const name=clean(b.name,120),desktop=clean(b.desktop,2000),mobile=clean(b.mobile,2000)
  for(const url of [desktop,mobile])if(url&&!safeBannerUrl(url))return fail('Invalid image URL')
  if(publish&&b.active&&(!name||!desktop))return fail('Banner name and desktop image are required')
  const texts={} as Banner['texts']
  for(const locale of ['sr','en'] as const){
   const input=b.texts?.[locale];if(!input)return fail('Both SR and EN are required')
   const t=emptyText();for(const k of Object.keys(t) as (keyof BannerText)[])t[k]=clean(input[k],k==='description'?1000:k.endsWith('Url')?2000:250)
   if(publish&&b.active&&(!t.title||!t.alt))return fail(`${locale.toUpperCase()}: title and alt are required`)
   for(const prefix of ['primary','secondary'] as const){const label=t[`${prefix}Label`],url=t[`${prefix}Url`];if(url&&!safeBannerUrl(url))return fail('Use an internal path, anchor or HTTPS link');if(publish&&b.active&&Boolean(label)!==Boolean(url))return fail(`${locale.toUpperCase()}: button label and URL must be filled together`)}
   texts[locale]=t
  }
  return {id:b.id,name,active:b.active,desktop,mobile,align:b.align,tone:b.tone,gradient:b.gradient,fit:b.fit,texts,updatedAt:typeof b.updatedAt==='string'?b.updatedAt:''}
 })
 return {banners,autoplay:c.autoplay,interval:c.interval}
}
export function moveBanner(c:Carousel,from:number,to:number):Carousel {
 if(from<0||to<0||from>=c.banners.length||to>=c.banners.length)return c
 const banners=[...c.banners];banners.splice(to,0,banners.splice(from,1)[0]);return {...c,banners}
}
