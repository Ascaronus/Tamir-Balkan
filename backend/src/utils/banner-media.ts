import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import type { Knex } from 'knex'
import type { Carousel } from '../shared/banner-model'
import { BannerError } from './homepage-banners'
export const bannerUploadLimit=()=>{const n=Number(process.env.BANNER_MAX_UPLOAD_BYTES);return Number.isSafeInteger(n)&&n>0?Math.min(n,20*1024*1024):5*1024*1024}
export const mediaRoot=()=>path.resolve(process.cwd(),'static','banners')
export function decodeBannerImage(input:any){
 const max=bannerUploadLimit()
 if(typeof input?.data!=='string'||input.data.length>Math.ceil(max/3)*4||!input.data.length||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.data))throw new BannerError(400,'Invalid image or file exceeds upload limit')
 const bytes=Buffer.from(input.data,'base64');if(bytes.length>max||bytes.toString('base64')!==input.data)throw new BannerError(400,'Invalid image encoding')
 const hex=bytes.subarray(0,12).toString('hex'),ascii=bytes.subarray(0,12).toString('ascii')
 const detected=hex.startsWith('89504e470d0a1a0a')?'image/png':hex.startsWith('ffd8ff')?'image/jpeg':ascii.startsWith('RIFF')&&ascii.slice(8)==='WEBP'?'image/webp':bytes.subarray(4,8).toString('ascii')==='ftyp'&&/avif|avis/.test(bytes.subarray(8,32).toString('ascii'))?'image/avif':null
 if(!detected||detected!==input.mime)throw new BannerError(400,'Only PNG, JPEG, WebP and AVIF with matching MIME and signature are supported')
 return {bytes,mime:detected,extension:detected==='image/jpeg'?'jpg':detected.split('/')[1]}
}
export async function uploadBannerImage(db:Knex,input:unknown){
 const {bytes,mime,extension}=decodeBannerImage(input),id='media_'+randomUUID(),filename=id+'.'+extension
 await mkdir(mediaRoot(),{recursive:true});await writeFile(path.join(mediaRoot(),filename),bytes,{flag:'wx',mode:0o644})
 const base=(process.env.MEDUSA_PUBLIC_BACKEND_URL||'https://api.tamir.rs').replace(/\/$/,'')
 const media={id,filename,mime,url:`${base}/static/banners/${filename}`};await db('tamir_banner_media').insert(media);return media
}
export async function checkBannerMedia(db:Knex,c:Carousel){
 for(const url of new Set(c.banners.filter(b=>b.active).flatMap(b=>[b.desktop,b.mobile]).filter(Boolean))){
  if(url==='/design/tamir-family-winter.webp')continue // Versioned original storefront asset, retained in every release.
  const row=await db('tamir_banner_media').where({url}).first()
  if(!row||!/^media_[a-f0-9-]+\.(png|jpg|webp|avif)$/.test(row.filename))throw new BannerError(400,'Upload banner images before publishing')
  const file=await stat(path.join(mediaRoot(),row.filename)).catch(()=>null)
  if(!file?.isFile()||file.size===0)throw new BannerError(400,'Banner image is missing from permanent storage')
 }
}
