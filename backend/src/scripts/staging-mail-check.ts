import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendRegistrationCode } from "../utils/registration-email"

// Проверка почтового тракта staging: письмо уходит через продуктовый код
// (nodemailer + mailConfig), а не через отдельную тестовую transports.
// Acceptance: письмо дошло в Mailpit и содержит код.
const MAILPIT_API = process.env.STAGING_MAILPIT_API_URL || "http://127.0.0.1:8025"
const CHECK_TO = process.env.STAGING_MAIL_CHECK_TO || "staging-smoke@tamir.local"

function recipients(message: any): string[] {
  const to = message?.To || message?.Message?.To || []
  return (Array.isArray(to) ? to : [to])
    .map((entry: any) => String(entry?.Address || entry || "").toLowerCase())
}

export default async function stagingMailCheck({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const recipient = CHECK_TO.trim().toLowerCase()
  const code = String(Math.floor(100000 + Math.random() * 900000))

  await sendRegistrationCode(recipient, code)
  logger.info(`staging-mail-check: письмо отправлено через продуктовый тракт (SMTP_HOST=${process.env.SMTP_HOST})`)

  // Mailpit пишет письмо не мгновенно: даём ему до 30 секунд.
  let found: any = null
  for (let attempt = 0; attempt < 30 && !found; attempt++) {
    const response = await fetch(`${MAILPIT_API}/api/v1/messages?limit=50`)
    if (!response.ok) throw new Error(`Mailpit API ответил ${response.status}. Проверьте STAGING_MAILPIT_API_URL.`)
    const body: any = await response.json()
    const messages = Array.isArray(body?.messages) ? body.messages : []
    found = messages.find((message: any) => recipients(message).includes(recipient))
    if (!found) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  if (!found) throw new Error("Письмо не появилось в Mailpit: SMTP-тракт работает, доставка не подтверждена.")

  const detail = await fetch(`${MAILPIT_API}/api/v1/message/${encodeURIComponent(found.ID)}`)
  if (!detail.ok) throw new Error(`Mailpit не отдал письмо ${found.ID}: HTTP ${detail.status}.`)
  const body = JSON.stringify(await detail.json())
  if (!body.includes(code)) throw new Error("Письмо дошло, но кода в нём нет: тело письма испорчено.")

  logger.info(`staging-mail-check: письмо принято Mailpit (id=${found.ID}), код в теле найден.`)
}
