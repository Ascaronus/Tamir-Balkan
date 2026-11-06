import type {AuthenticatedMedusaRequest,MedusaResponse} from '@medusajs/framework/http'
import {chatDb,failure} from '../../../utils/chat/http'
import {telegramUpdate,kickChat} from '../../../utils/chat/delivery'
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse){res.setHeader('Cache-Control','no-store');try{const db=chatDb(req),result=await telegramUpdate(db,req.headers['x-telegram-bot-api-secret-token'],req.body);kickChat(db);return res.json(result)}catch(e){return failure(e,res)}}
