import nodemailer from "nodemailer"
import { ReviewError } from "./review-validation"

export function mailConfig(env: NodeJS.ProcessEnv = process.env) {
  const user = env.SMTP_USER?.trim()
  const pass = env.SMTP_PASSWORD?.replace(/\s/g, "")
  if (!user || !pass) throw new Error("Registration email: configure SMTP_USER and SMTP_PASSWORD")
  const port = Number(env.SMTP_PORT || "587")
  if (port !== 587 && port !== 465) throw new Error("SMTP_PORT must be 587 or 465")
  return {
    host: env.SMTP_HOST || "smtp.gmail.com", port, secure: port === 465,
    requireTLS: true, auth: { user, pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    logger: false, debug: false,
  }
}

export function welcomeMessage(name?: string | null) {
  const greeting = name?.trim() || ""
  return {
    subject: "Dobro došli u TAMIR / Welcome to TAMIR",
    text: [
      `Zdravo${greeting ? `, ${greeting}` : ""}!`,
      "Vaš TAMIR nalog je uspešno kreiran. Možete se prijaviti i nastaviti kupovinu.",
      "https://tamir.rs",
      "Ako niste kreirali ovaj nalog, kontaktirajte nas odgovorom na ovu poruku.",
      "", `Hello${greeting ? `, ${greeting}` : ""}!`,
      "Your TAMIR account has been created. You can sign in and continue shopping.",
      "https://tamir.rs",
      "If you did not create this account, please contact us by replying to this email.",
      "", "TAMIR",
    ].join("\n\n"),
  }
}

export async function sendRegistrationEmail(customer: { id: string; email: string; first_name?: string | null }) {
  const config = mailConfig()
  const transport = nodemailer.createTransport(config)
  try {
    const result = await transport.sendMail({
      from: { name: "TAMIR", address: config.auth.user },
      to: { address: customer.email, name: "" },
      ...welcomeMessage(customer.first_name),
      // Stable ID also helps diagnose retries without logging customer addresses.
      messageId: `<welcome.${customer.id}@tamir.rs>`,
      disableFileAccess: true, disableUrlAccess: true,
    })
    if (!result.accepted.length) throw new Error("Not accepted")
  } catch {
    // SMTP errors can contain credentials and recipient addresses; do not log them.
    throw new Error("Registration email was not accepted by SMTP. Check credentials and server connectivity.")
  } finally {
    transport.close()
  }
}

export async function sendRegistrationCode(email: string, code: string) {
  const config = mailConfig()
  const transport = nodemailer.createTransport(config)
  try {
    const result = await transport.sendMail({
      from: { name: "TAMIR", address: config.auth.user }, to: { address: email, name: "" },
      subject: "TAMIR — Kod za registraciju / Registration code",
      text: `Vaš kod za registraciju: ${code}\n\nKod važi 10 minuta. Ne delite ga ni sa kim. Ako niste zatražili registraciju, zanemarite ovu poruku.\n\nYour registration code: ${code}\n\nThis code expires in 10 minutes. Do not share it. If you did not request registration, ignore this message.\n\nTAMIR`,
      disableFileAccess: true, disableUrlAccess: true,
    })
    if (!result.accepted.length) throw new Error("Not accepted")
  } catch {
    throw new ReviewError(503, "CODE_SEND_FAILED")
  } finally { transport.close() }
}
