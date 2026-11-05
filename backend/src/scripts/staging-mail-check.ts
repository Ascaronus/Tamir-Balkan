import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendRegistrationCode } from "../utils/registration-email"

// Проверка почтового тракта staging: письмо уходит через продуктовый код
// (nodemailer + mailConfig), а не через отдельную тестовую transports.
// Acceptance: письмо дошло в Mailpit и содержит код.
const MAILPIT_API = process.env.STAGING_MAILPIT_API_URL || "http://127.0.0.1:8025"
const CHECK_TO = process.env.STAGING_MAIL_CHECK_TO || "staging-smoke@tamir.local"
// Веб-интерфейс и API Mailpit закрыты HTTP Basic (MP_UI_AUTH в секретах compose),
// иначе ящик с кодами регистрации читала бы вся домашняя сеть. Смоук передаёт
// ту же пару user:pass через STAGING_MAILPIT_AUTH.
const MAILPIT_AUTH = process.env.STAGING_MAILPIT_AUTH || ""

function mailpitOptions(): RequestInit {
  return MAILPIT_AUTH
    ? { headers: { authorization: `Basic ${Buffer.from(MAILPIT_AUTH).toString("base64")}` } }
    : {}
}

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
    const response = await fetch(`${MAILPIT_API}/api/v1/messages?limit=50`, mailpitOptions())
    if (!response.ok) throw new Error(`Mailpit API ответил ${response.status}. Проверьте STAGING_MAILPIT_API_URL и STAGING_MAILPIT_AUTH.`)
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
