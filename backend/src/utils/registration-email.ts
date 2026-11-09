import nodemailer from "nodemailer"
import { emailLayout, escapeHtml } from "./email-layout"
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
    html: emailLayout({
      title: "Dobro došli u TAMIR / Welcome to TAMIR",
      preview: "Vaš TAMIR nalog je uspešno kreiran. / Your TAMIR account has been created.",
      label: "DOBRO DOŠLI / WELCOME",
      content: `<tr><td style="padding:28px 24px;overflow-wrap:anywhere">
        <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:34px">Dobro došli u TAMIR!</h1>
        ${paragraph(`Zdravo${greeting ? `, ${greeting}` : ""}!`)}
        ${paragraph("Vaš TAMIR nalog je uspešno kreiran. Možete se prijaviti i nastaviti kupovinu.")}
        ${paragraph(`Hello${greeting ? `, ${greeting}` : ""}!`, true)}
        ${paragraph("Your TAMIR account has been created. You can sign in and continue shopping.", true)}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px"><tr><td style="background:#29251f;border-radius:6px;padding:14px 20px"><a href="https://tamir.rs" style="font-size:14px;line-height:22px;color:#ffffff;text-decoration:none">Posetite TAMIR / Visit TAMIR</a></td></tr></table>
      </td></tr>`,
      footer: { sr: "Ako niste kreirali ovaj nalog, kontaktirajte nas odgovorom na ovu poruku.", en: "If you did not create this account, please contact us by replying to this email." },
    }),
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
  return sendAccountCode(email, code, false)
}
export async function sendPasswordResetCode(email: string, code: string) {
  return sendAccountCode(email, code, true)
}
async function sendAccountCode(email: string, code: string, reset: boolean) {
  const config = mailConfig()
  const transport = nodemailer.createTransport(config)
  try {
    const result = await transport.sendMail({
      from: { name: "TAMIR", address: config.auth.user }, to: { address: email, name: "" },
      ...accountCodeMessage(code, reset),
      disableFileAccess: true, disableUrlAccess: true,
    })
    if (!result.accepted.length) throw new Error("Not accepted")
  } catch {
    throw new ReviewError(503, "CODE_SEND_FAILED")
  } finally { transport.close() }
}

function paragraph(text: string, english = false) {
  return `<p${english ? ' lang="en"' : ""} style="margin:0 0 12px;font-size:${english ? 13 : 15}px;line-height:24px;color:${english ? "#6e665e" : "#29251f"}">${escapeHtml(text)}</p>`
}

export function accountCodeMessage(code: string, reset: boolean) {
  return {
    subject: reset ? "TAMIR — Promena lozinke / Password reset" : "TAMIR — Kod za registraciju / Registration code",
    text: reset ? `Kod za promenu lozinke: ${code}\n\nKod važi 10 minuta. Ne delite ga ni sa kim. Ako niste zatražili promenu lozinke, zanemarite ovu poruku; lozinka ostaje nepromenjena.\n\nYour password reset code: ${code}\n\nThis code expires in 10 minutes. Do not share it. If you did not request a password reset, ignore this message; your password remains unchanged.\n\nTAMIR` : `Vaš kod za registraciju: ${code}\n\nKod važi 10 minuta. Ne delite ga ni sa kim. Ako niste zatražili registraciju, zanemarite ovu poruku.\n\nYour registration code: ${code}\n\nThis code expires in 10 minutes. Do not share it. If you did not request registration, ignore this message.\n\nTAMIR`,
    html: emailLayout({
      title: reset ? "TAMIR — Promena lozinke / Password reset" : "TAMIR — Kod za registraciju / Registration code",
      preview: reset ? "Promena lozinke / Password reset" : "Potvrdite registraciju / Confirm your registration",
      label: reset ? "PROMENA LOZINKE / PASSWORD RESET" : "REGISTRACIJA / REGISTRATION",
      content: `<tr><td style="padding:28px 24px">
        <h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:26px;font-weight:400;line-height:34px">${reset ? "Promena lozinke" : "Potvrdite registraciju"}</h1>
        ${paragraph(reset ? "Unesite ovaj kod da biste promenili lozinku." : "Unesite ovaj kod da biste završili registraciju.")}
        ${paragraph(reset ? "Enter this code to reset your password." : "Enter this code to complete your registration.", true)}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#f7f5f1;border:1px solid #e7e2da;border-radius:8px"><tr><td align="center" style="padding:22px 12px;font-family:monospace;font-size:30px;font-weight:700;letter-spacing:4px;line-height:40px;overflow-wrap:anywhere">${escapeHtml(code)}</td></tr></table>
        ${paragraph("Kod važi 10 minuta. Ne delite ga ni sa kim.")}
        ${paragraph("This code expires in 10 minutes. Do not share it.", true)}
      </td></tr>`,
      footer: {
        sr: reset ? "Ako niste zatražili promenu lozinke, zanemarite ovu poruku; lozinka ostaje nepromenjena." : "Ako niste zatražili registraciju, zanemarite ovu poruku.",
        en: reset ? "If you did not request a password reset, ignore this message; your password remains unchanged." : "If you did not request registration, ignore this message.",
      },
    }),
  }
}
