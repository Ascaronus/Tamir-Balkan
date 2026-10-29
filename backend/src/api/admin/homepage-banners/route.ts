import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { reviewDb } from '../../../utils/review-http'
import { bannerState, changeBanners } from '../../../utils/homepage-banners'
import { bannerAdmin, bannerFailure } from '../../../utils/banner-http'
import { checkBannerMedia } from '../../../utils/banner-media'
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse){res.setHeader('Cache-Control','no-store');try{await bannerAdmin(req);res.json(await bannerState(reviewDb(req)))}catch(e){bannerFailure(e,res)}}
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){res.setHeader('Cache-Control','no-store');try{await bannerAdmin(req);const db=reviewDb(req);res.json(await changeBanners(db,req.body,c=>checkBannerMedia(db,c)))}catch(e){bannerFailure(e,res)}}
