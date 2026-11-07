import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http'
import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { ZodError } from 'zod'
import { clientIp } from '../login-rate-limit'
import { ChatError, hashGuest, safeCode } from './security'
import type { ChatIdentity } from './conversations'
export const chatDb = (req: AuthenticatedMedusaRequest) => req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
export async function identity(req: AuthenticatedMedusaRequest): Promise<ChatIdentity> {
  const guestToken =
    typeof req.headers['x-tamir-chat-guest'] === 'string' ? req.headers['x-tamir-chat-guest'] : undefined
  if (req.auth_context?.actor_type === 'customer' && req.auth_context.actor_id) {
    const c = await req.scope.resolve(Modules.CUSTOMER).retrieveCustomer(req.auth_context.actor_id)
    if (!c?.has_account) throw new ChatError(401, 'LOGIN_REQUIRED')
    return {
      customerId: c.id,
      profile: {
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email,
        email: c.email,
        phone: c.phone || '',
      },
      guestToken,
    }
  }
  return { guestToken }
}
const ranks = { viewer: 1, operator: 2, manager: 3 }
export async function admin(req: AuthenticatedMedusaRequest, permission: keyof typeof ranks = 'viewer') {
  if (req.auth_context?.actor_type !== 'user' || !req.auth_context.actor_id) throw new ChatError(403, 'CHAT_FORBIDDEN')
  const user = await req.scope.resolve(Modules.USER).retrieveUser(req.auth_context.actor_id),
    bootstrap = (process.env.CHAT_ADMIN_EMAILS || process.env.BANNER_ADMIN_EMAILS || 'admin@tamir.local')
      .split(',')
      .map((s) => s.trim().toLowerCase()),
    op = await chatDb(req)('tamir_chat_operator').where({ user_id: user.id, enabled: true }).first(),
    role = bootstrap.includes(user.email.toLowerCase()) ? 'manager' : op?.role
  if (!role || ranks[role as keyof typeof ranks] < ranks[permission]) throw new ChatError(403, 'CHAT_FORBIDDEN')
  return { id: user.id, role }
}
export async function limit(req: AuthenticatedMedusaRequest, action: string, max = 60) {
  const db = chatDb(req),
    key = hashGuest(`${action}:${req.auth_context?.actor_id || clientIp(req) || 'unknown'}`)
  const { rows } = await db.raw(
    `INSERT INTO tamir_chat_rate(key,count,expires_at) VALUES (?,1,now()+interval '1 minute') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN tamir_chat_rate.expires_at<now() THEN 1 ELSE tamir_chat_rate.count+1 END,expires_at=CASE WHEN tamir_chat_rate.expires_at<now() THEN now()+interval '1 minute' ELSE tamir_chat_rate.expires_at END RETURNING count`,
    [key],
  )
  if (Number(rows[0].count) > max) throw new ChatError(429, 'CHAT_RATE_LIMIT')
}
export function failure(e: unknown, res: MedusaResponse) {
  return res
    .status(e instanceof ChatError ? e.status : e instanceof ZodError ? 400 : 503)
    .json({ code: e instanceof ZodError ? 'INVALID_CHAT_INPUT' : safeCode(e) })
}
