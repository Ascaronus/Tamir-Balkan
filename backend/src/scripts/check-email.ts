import type { ExecArgs } from "@medusajs/framework/types"
import nodemailer from "nodemailer"
import { mailConfig } from "../utils/registration-email"

// Checks SMTP login and TLS without sending a message to any recipient.
export default async function checkEmail({ container }: ExecArgs) {
  const logger = container.resolve("logger")
  const transport = nodemailer.createTransport(mailConfig())
  try {
    await transport.verify()
    logger.info("SMTP connection and authentication succeeded. No email was sent.")
  } catch {
    throw new Error("SMTP verification failed. Check SMTP settings, Gmail app password and outbound connectivity.")
  } finally {
    transport.close()
  }
}
