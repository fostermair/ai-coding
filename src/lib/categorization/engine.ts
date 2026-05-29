import path from "path"
import fs from "fs"

export type CategoryMeta = {
  slug: string
  label: string
  default_excluded_from_stats: boolean
  color?: string
}

type CategoryRule = {
  pattern: string
  category: string
}

type RulesFile = {
  categories: CategoryMeta[]
  rules: CategoryRule[]
}

type CompiledRule = {
  compiled: RegExp
  category: string
}

let _rulesFile: RulesFile | null = null
let _compiledRules: CompiledRule[] | null = null

function loadRules(): RulesFile {
  if (_rulesFile) return _rulesFile
  const filePath = path.join(process.cwd(), "src", "lib", "categorization", "rules.json")
  const raw = fs.readFileSync(filePath, "utf-8")
  _rulesFile = JSON.parse(raw) as RulesFile
  return _rulesFile
}

function getCompiledRules(): CompiledRule[] {
  if (_compiledRules) return _compiledRules
  const rules = loadRules()
  _compiledRules = rules.rules.map((r) => ({
    compiled: new RegExp(r.pattern, "i"),
    category: r.category,
  }))
  return _compiledRules
}

export function getAllCategories(): CategoryMeta[] {
  return loadRules().categories
}

export function getCategoryMeta(slug: string): CategoryMeta | undefined {
  return loadRules().categories.find((c) => c.slug === slug)
}

export function categorize(rawName: string, alias?: string): string {
  const rules = getCompiledRules()
  for (const rule of rules) {
    if (rule.compiled.test(rawName)) return rule.category
    if (alias && rule.compiled.test(alias)) return rule.category
  }
  return "sonstiges"
}
