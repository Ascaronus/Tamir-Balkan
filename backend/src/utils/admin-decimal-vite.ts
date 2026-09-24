import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

// Medusa has no extension zone for replacing these built-in fields. Transform
// only the audited sections of its pinned dashboard, without editing node_modules.
// Exact replacement counts and a preflight make upstream changes fail the build.
function replace(source: string, pattern: string | RegExp, replacement: string, count: number) {
  const matches = typeof pattern === "string" ? source.split(pattern).length - 1 : [...source.matchAll(pattern)].length
  if (matches !== count) throw new Error(`Admin decimal patch: expected ${count} matches for ${pattern}, got ${matches}`)
  return typeof pattern === "string" ? source.split(pattern).join(replacement) : source.replace(pattern, replacement)
}

const textInputs = (s: string) => replace(s, 'type: "number"', 'type: "text", inputMode: "decimal"', 4)
const dimensionSchemas = (s: string) => replace(s, /(width|height|length|weight): optionalInt/g, "$1: tamirOptionalDecimal", 4)
const rawChanges = (s: string) => {
  s = replace(s, /onChange\((?:parseFloat|Number)\((value\d*)\)\)/g, "onChange($1)", 4)
  return replace(s, 'value: value || ""', 'value: value ?? ""', 4)
}

export const decimalRules = [
  {
    suffix: "product-attributes-form/product-attributes-form.tsx", anchor: "var dimension =",
    apply(s: string) {
      s = replace(s, /var dimension = [\s\S]*?\.optional\(\)\.nullable\(\);/g, "var dimension = tamirNullableDecimal;", 1)
      s = replace(s, /(product|data)\.(height|width|length|weight) \? \1\.\2 : null/g, "$1.$2 ?? null", 8)
      return rawChanges(textInputs(s))
    },
  },
  {
    suffix: "product-edit-variant-form.tsx", anchor: "var ProductEditVariantSchema",
    apply(s: string) {
      s = replace(s, /variant\.(weight|width|height|length) \|\| ""/g, 'variant.$1 ?? ""', 4)
      return textInputs(dimensionSchemas(s))
    },
  },
  {
    suffix: "product-create/constants.ts", anchor: "var ProductCreateVariantSchema",
    apply(s: string) {
      return replace(dimensionSchemas(s), /(width|height|length|weight): z\.string\(\)\.optional\(\)/g, "$1: tamirOptionalDecimal", 4)
    },
  },
  {
    suffix: "product-create/utils.ts", anchor: "var normalizeProductFormValues",
    apply(s: string) {
      return replace(s, /parseFloat\(values\.(width|height|length|weight)\)/g, "tamirParseDecimal(values.$1)", 4)
    },
  },
  { suffix: "inventory-create-form/schema.ts", anchor: "var CreateInventoryItemSchema", apply: dimensionSchemas },
  { suffix: "inventory-create-form/inventory-create-form.tsx", anchor: 'type: "number"', apply: textInputs },
  {
    suffix: "edit-item-attributes-form.tsx", anchor: "var EditInventoryItemAttributesSchema",
    apply(s: string) {
      s = replace(s, /(height|width|length|weight): z\.number\(\)\.positive\(\)\.optional\(\)/g, "$1: tamirNullableDecimal", 4)
      return rawChanges(textInputs(s))
    },
  },
  {
    suffix: "percentage-input/percentage-input.tsx", anchor: "var DeprecatedPercentageInput",
    apply(s: string) { return replace(s, /jsx\(\s+Input,/g, "jsx(TamirLegacyDecimalInput,", 1) },
  },
  {
    suffix: "create-campaign-form-fields.tsx", anchor: "parseInt(value",
    apply(s: string) { return replace(s, /parseInt\((value\d*)\)/g, "Number($1)", 1) },
  },
  {
    suffix: "edit-campaign-budget-form.tsx", anchor: "var EditCampaignSchema",
    apply(s: string) {
      s = replace(s, /parseInt\((value\d*)\)/g, "Number($1)", 1)
      return replace(s, "data.limit ? data.limit : null", "data.limit ?? null", 1)
    },
  },
  {
    suffix: "use-data-grid-form-handlers.tsx", anchor: "function convertToNumber",
    apply(s: string) { return replace(s, "const converted = Number(value);", "const converted = tamirParseDecimal(value);", 1) },
  },
  {
    suffix: "metadata-form/metadata-form.tsx", anchor: "const isNumeric =",
    apply(s: string) {
      s = replace(s, /const isNumeric = .*?\.test\(value\);/g, "const isNumeric = Number.isFinite(tamirParseDecimal(value));", 1)
      return replace(s, "update[key] = parseFloat(value);", "update[key] = tamirParseDecimal(value);", 1)
    },
  },
]

export function transformDecimalDashboard(code: string, helperDir: string, seen?: Set<string>) {
  let changed = false
  const transformed = code.split(/(?=^\/\/ src\/)/m).map(section => {
    const firstLine = section.split("\n", 1)[0]
    const rule = decimalRules.find(rule => firstLine.endsWith(rule.suffix) && section.includes(rule.anchor))
    if (!rule) return section
    changed = true
    seen?.add(rule.suffix)
    return rule.apply(section)
  }).join("")
  if (!changed) return null
  return `import { optionalDecimal as tamirOptionalDecimal, nullableDecimal as tamirNullableDecimal, parseDecimal as tamirParseDecimal } from ${JSON.stringify(path.join(helperDir, "number.ts"))};\n` +
    `import { LegacyDecimalInput as TamirLegacyDecimalInput } from ${JSON.stringify(path.join(helperDir, "currency-input.tsx"))};\n` + transformed
}

export function decimalAdminConfig(backendRoot: string) {
  const helperDir = path.join(backendRoot, "src/admin/decimal")
  const dashboardDir = path.dirname(require.resolve("@medusajs/dashboard/package.json"))
  const currencyDir = path.dirname(require.resolve("react-currency-input-field/package.json"))
  return {
    resolve: { alias: [
      { find: /^react-currency-input-field$/, replacement: path.join(helperDir, "currency-input.tsx") },
      { find: /^tamir-original-currency-input$/, replacement: path.join(currencyDir, "dist/index.esm.js") },
    ] },
    optimizeDeps: { exclude: ["@medusajs/dashboard", "react-currency-input-field"] },
    plugins: [{
      name: "tamir-admin-decimals", enforce: "pre" as const,
      buildStart() {
        const version = JSON.parse(readFileSync(path.join(dashboardDir, "package.json"), "utf8")).version
        if (version !== "2.13.1") throw new Error("Review decimal field compatibility before upgrading Medusa dashboard")
        const seen = new Set<string>()
        for (const file of readdirSync(path.join(dashboardDir, "dist"))) {
          if (file.endsWith(".mjs")) transformDecimalDashboard(readFileSync(path.join(dashboardDir, "dist", file), "utf8"), helperDir, seen)
        }
        for (const rule of decimalRules) if (!seen.has(rule.suffix)) throw new Error(`Missing admin decimal patch target: ${rule.suffix}`)
      },
      transform(code: string, id: string) {
        if (!id.replace(/\\/g, "/").includes("/@medusajs/dashboard/dist/") || !id.endsWith(".mjs")) return null
        const transformed = transformDecimalDashboard(code, helperDir)
        return transformed ? { code: transformed, map: null } : null
      },
    }],
  }
}
