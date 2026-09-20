# Browser language selection

The server reads Accept-Language on the initial request. A valid store_locale cookie (manual selection) takes priority. Otherwise the highest-priority browser language is matched against locales in frontend/src/lib/i18n/config.ts, including regional/script tags. Unsupported primary languages fall back to Serbian, even when English is a secondary preference. Missing headers also use Serbian.

Adding a language:
1. Add its BCP 47 code to locales in config.ts.
2. Add its message JSON and register it in messages.ts (the typed map requires all supported languages).
3. Add lang.<code> labels to all dictionaries.
4. Configure corresponding translations/locales in Medusa. medusaStoreLocale defaults to passing the code through; Serbian keeps sr-RS.

No changes to the detector, locale API validation or switcher loop are needed. This does not automatically translate product content or change existing currency/date formatting.

Manual choices persist for one year. To test browser detection after a manual selection, delete the store_locale cookie or use a private window with the desired browser language.
