import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { reviewDb } from '../../../utils/review-http'
import { bannerState } from '../../../utils/homepage-banners'
import { bannerFailure } from '../../../utils/banner-http'
export async function GET(req:MedusaRequest,res:MedusaResponse){try{
 const row=await bannerState(reviewDb(req)),etag=`"banners-${row.revision}"`
 // Revalidate every response: publication changes the ETag immediately, including across workers.
 res.setHeader('Cache-Control','public, max-age=0, must-revalidate');res.setHeader('ETag',etag)
 if(req.headers['if-none-match']===etag){res.status(304).end();return}
 const {banners,autoplay,interval}=row.published
 res.json({autoplay,interval,banners:banners.filter((b:any)=>b.active).map(({name,updatedAt,...b}:any)=>b)})
}catch(e){res.setHeader('Cache-Control','no-store');bannerFailure(e,res)}}
