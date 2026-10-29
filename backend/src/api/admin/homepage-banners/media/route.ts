import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { reviewDb } from '../../../../utils/review-http'
import { uploadBannerImage } from '../../../../utils/banner-media'
import { bannerAdmin, bannerFailure } from '../../../../utils/banner-http'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){res.setHeader('Cache-Control','no-store');try{await bannerAdmin(req);res.status(201).json(await uploadBannerImage(reviewDb(req),req.body))}catch(e){bannerFailure(e,res)}}
