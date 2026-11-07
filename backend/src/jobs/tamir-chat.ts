import type { MedusaContainer } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { drainChat } from '../utils/chat/delivery'
import { pruneChat } from '../utils/chat/conversations'
export default async function chatWorker(container: MedusaContainer) {
  const db = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
  await drainChat(db)
  await pruneChat(db)
}
export const config = { name: 'tamir-chat-delivery', schedule: { interval: 10000, concurrency: 'forbid' as const } }
