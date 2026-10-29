import type { Knex } from 'knex'
import { carouselInput, initialCarousel, type Carousel } from '../shared/banner-model'
export class BannerError extends Error { constructor(public status:number,message:string){super(message)} }
export const bannerSchema=`CREATE TABLE IF NOT EXISTS tamir_homepage_carousel (id integer PRIMARY KEY CHECK(id=1), draft jsonb NOT NULL, published jsonb NOT NULL, previous jsonb, revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tamir_banner_media (id text PRIMARY KEY,url text UNIQUE NOT NULL,filename text NOT NULL,mime text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());`
export async function setupBanners(db:Knex){await db.raw(bannerSchema);await db('tamir_homepage_carousel').insert({id:1,draft:JSON.stringify(initialCarousel),published:JSON.stringify(initialCarousel)}).onConflict('id').ignore()}
export async function bannerState(db:Knex){const row=await db('tamir_homepage_carousel').where({id:1}).first();if(!row)throw new BannerError(503,'Banner storage is not initialized');return row}
export async function changeBanners(db:Knex,body:any,checkMedia:(c:Carousel)=>Promise<void>){
 return db.transaction(async trx=>{
  const row=await trx('tamir_homepage_carousel').where({id:1}).forUpdate().first();if(!row)throw new BannerError(503,'Banner storage is not initialized')
  if(!Number.isInteger(body?.revision)||body.revision<1)throw new BannerError(400,'A valid revision is required')
  if(body.revision!==row.revision)throw new BannerError(409,'Another administrator changed the banners. Reload before saving.')
  let draft:Carousel=row.draft,published:Carousel=row.published,previous=row.previous
  const now=new Date().toISOString()
  if(body.action==='saveDraft'){
   try{draft=carouselInput(body.draft)}catch(e){throw new BannerError(400,(e as Error).message)}
   draft={...draft,banners:draft.banners.map(b=>({...b,updatedAt:JSON.stringify(b)===JSON.stringify(row.draft.banners.find((old:any)=>old.id===b.id))?b.updatedAt:now}))}
  }else if(body.action==='publish'||body.action==='publishAll'||body.action==='publishSettings'){
   if(body.action==='publishAll')published=draft
   else if(body.action==='publishSettings')published={...published,autoplay:draft.autoplay,interval:draft.interval,banners:[...published.banners].sort((a,b)=>draft.banners.findIndex(x=>x.id===a.id)-draft.banners.findIndex(x=>x.id===b.id))}
   else {const banner=draft.banners.find(b=>b.id===body.id);if(!banner)throw new BannerError(404,'Banner not found');published={...published,banners:[...published.banners.filter(b=>b.id!==body.id),banner].sort((a,b)=>draft.banners.findIndex(x=>x.id===a.id)-draft.banners.findIndex(x=>x.id===b.id))}}
   try{published=carouselInput(published,true)}catch(e){throw new BannerError(400,(e as Error).message)}
   await checkMedia(published);previous=row.published
  }else if(body.action==='deactivate'||body.action==='delete'){
   if(!draft.banners.some(b=>b.id===body.id)&&!published.banners.some(b=>b.id===body.id))throw new BannerError(404,'Banner not found')
   const update=(c:Carousel)=>({...c,banners:body.action==='delete'?c.banners.filter(b=>b.id!==body.id):c.banners.map(b=>b.id===body.id?{...b,active:false,updatedAt:now}:b)})
   draft=update(draft);published=update(published);previous=row.published
  }else if(body.action==='restore'){
   if(!previous)throw new BannerError(409,'No previous publication')
   await checkMedia(previous);published=previous;previous=row.published
   draft={...draft,banners:[...draft.banners,...published.banners.filter(b=>!draft.banners.some(d=>d.id===b.id))]}
  }else throw new BannerError(400,'Unknown banner action')
  const [result]=await trx('tamir_homepage_carousel').where({id:1}).update({draft:JSON.stringify(draft),published:JSON.stringify(published),previous:previous?JSON.stringify(previous):null,revision:row.revision+1,updated_at:now}).returning('*');return result
 })
}
