import { z } from 'zod'
export const localized = z
  .object({ sr: z.string().trim().min(1).max(1000), en: z.string().trim().min(1).max(1000) })
  .strict()
const template = z.object({ enabled: z.boolean(), text: localized }).strict()
export const templateNames = ['welcome', 'offline', 'sent', 'error', 'returning', 'closed', 'reopened'] as const
export const chatConfigSchema = z
  .object({
    enabled: z.boolean(),
    guests: z.boolean(),
    position: z.enum(['right', 'left']),
    showStatus: z.boolean(),
    productContext: z.boolean(),
    notifications: z.boolean(),
    title: localized.refine((v) => v.sr.length <= 120 && v.en.length <= 120),
    button: localized.refine((v) => v.sr.length <= 120 && v.en.length <= 120),
    telegram: z
      .object({
        enabled: z.boolean(),
        chatId: z.string().regex(/^$|^-?\d{1,20}$/),
        topics: z.boolean(),
        notifyNew: z.boolean(),
        notifyMessages: z.boolean(),
        notifyErrors: z.boolean(),
      })
      .strict(),
    translation: z
      .object({
        enabled: z.boolean(),
        operatorLanguage: z.enum(['ru', 'sr', 'en']),
        locales: z
          .array(z.enum(['sr', 'en']))
          .min(1)
          .max(2)
          .refine((v) => new Set(v).size === v.length),
        projectId: z.literal('tamir-493911'),
      })
      .strict(),
    templates: z
      .object({
        welcome: template,
        offline: template,
        sent: template,
        error: template,
        returning: template,
        closed: template,
        reopened: template,
      })
      .strict(),
    retentionDays: z.number().int().min(7).max(730),
  })
  .strict()
export type ChatConfig = z.infer<typeof chatConfigSchema>
const msg = (sr: string, en: string) => ({ enabled: true, text: { sr, en } })
export const defaultChatConfig: ChatConfig = {
  enabled: false,
  guests: true,
  position: 'right',
  showStatus: true,
  productContext: true,
  notifications: true,
  title: { sr: 'TAMIR podrška', en: 'TAMIR Support' },
  button: { sr: 'Razgovarajte sa nama', en: 'Chat with us' },
  telegram: { enabled: false, chatId: '', topics: true, notifyNew: true, notifyMessages: true, notifyErrors: true },
  translation: { enabled: true, operatorLanguage: 'ru', locales: ['sr', 'en'], projectId: 'tamir-493911' },
  retentionDays: 90,
  templates: {
    welcome: msg('Zdravo! Kako vam možemo pomoći?', 'Hello! How can we help you?'),
    offline: msg(
      'Trenutno nismo dostupni. Ostavite nam poruku.',
      "We're currently unavailable. Please leave us a message.",
    ),
    sent: msg('Poruka je sačuvana i čeka dostavu.', 'Message saved and awaiting delivery.'),
    error: msg('Dostava nije uspela. Pokušaćemo ponovo.', 'Delivery failed. We will retry.'),
    returning: msg('Dobro došli nazad!', 'Welcome back!'),
    closed: msg('Razgovor je zatvoren.', 'Conversation closed.'),
    reopened: msg('Razgovor je ponovo otvoren.', 'Conversation reopened.'),
  },
}
export const guestSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.union([z.literal(''), z.string().email().max(254)]).default(''),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^$|^\+?[0-9 ()-]{6,30}$/)
      .default(''),
  })
  .strict()
export const messageSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(1500)
      .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)),
    clientId: z.string().uuid(),
  })
  .strict()
export const operatorSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100),
    userId: z
      .string()
      .regex(/^user_[a-zA-Z0-9]+$/)
      .nullable(),
    telegramId: z
      .string()
      .regex(/^\d{1,20}$/)
      .nullable(),
    role: z.enum(['viewer', 'operator', 'manager']),
    enabled: z.boolean(),
    available: z.boolean(),
  })
  .strict()
  .refine((v) => v.userId || v.telegramId, 'Operator identity required')
