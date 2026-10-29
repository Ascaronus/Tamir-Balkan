import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules } from '@medusajs/framework/utils'
import { BannerError } from './homepage-banners'
export async function bannerAdmin(req:AuthenticatedMedusaRequest){
 if(req.auth_context?.actor_type!=='user'||!req.auth_context.actor_id)throw new BannerError(403,'Administrator access required')
 const user=await req.scope.resolve(Modules.USER).retrieveUser(req.auth_context.actor_id)
 const allowed=(process.env.BANNER_ADMIN_EMAILS||'admin@tamir.local').split(',').map(v=>v.trim().toLowerCase())
 if(!user?.email||!allowed.includes(user.email.toLowerCase()))throw new BannerError(403,'Banner management permission required')
}
export function bannerFailure(error:unknown,res:MedusaResponse){return res.status(error instanceof BannerError?error.status:503).json({message:error instanceof BannerError?error.message:'Banner service unavailable'})}
