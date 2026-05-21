export interface KontoBankTransaction {
  buchungsdatum: string       // YYYY-MM-DD
  valutadatum: string         // YYYY-MM-DD
  typ: "kartenzahlung" | "überweisung" | "gutschrift" | "sonstige"
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  verwendungszweck: string | null
  iban: string | null
  bic: string | null
  betrag_cents: number        // negativ = Ausgabe
}

export interface ParsedKontoauszug {
  konto_iban: string
  periode: string             // YYYY-MM
  kontoinhaber: string
  transactions: KontoBankTransaction[]
  parseErrors: string[]
}

// ── Regex helpers ─────────────────────────────────────────────────────────────

/** Matches inline transaction header: "DD.MM. DD.MM. Type" or "DD.MM.DD.MM.Type" */
const INLINE_DATE_RE = /^(\d{2})\.(\d{2})\.\s*(\d{2})\.(\d{2})\.\s*(.+)$/

/** Matches a lone date: "DD.MM." */
const DATE_ONLY_RE = /^(\d{2})\.(\d{2})\.$/

/** Extracts the amount at end of a line: "...-49,08 €" */
const AMOUNT_SUFFIX_RE = /^(.*?)([+-]?\d{1,3}(?:\.\d{3})*,\d{2})\s*€\s*$/

/** Matches a line containing ONLY an amount: "-49,08 €" */
const AMOUNT_ONLY_RE = /^([+-]?\d{1,3}(?:\.\d{3})*,\d{2})\s*€\s*$/

/** All amounts on a Zusammenfassung line */
const ALL_AMOUNTS_RE = /([+-]?\d{1,3}(?:\.\d{3})*,\d{2})\s*€/g

const KNOWN_TYPES = ["Kartenzahlung", "Echtzeitüberweisung", "Überweisung", "Gutschrift", "Lastschrift"]

// Lines that should be skipped in the outer parsing loop
// Note: "IBAN:" is intentionally NOT here — transfer details use IBAN lines
const OUTER_SKIP_RE = [
  /^BIC:\s+\w/,                         // standalone BIC line (not part of transfer detail)
  /^Vorläufiger Kontoauszug/,
  /^\d{2}\.\d{2}\.\d{4}\s*[-–]/,        // date range "01.05.2026 - 21.05.2026"
  /^Kontostand/,
  /^Transaktionsübersicht$/,
  /^Buchung\s+Valuta\s*/,               // inline table header
  /^Seite \d+ von \d+/,
  /^C24 Bank/,
  /^Neue Mainzer/,
  /^Ust\.-ID/,
  /^\d{2}\/\d{4}$/,
  /^Startsaldo/,
  /^Kontobelastungen/,
  /^Kontogutschriften/,
  /^Endsaldo/,
  /^Pocket$/,
  /^Weitere Informationen/,
  /^Für das Girokonto/,
  /^Dieser gilt/,
  /^dessen Zugang/,
  /^Ihre Kontodisposition/,
  /^Der Kontostand/,
  /^Es kann zu/,
  /^Hinweis zur/,
  /^Guthaben sind/,
  /^können dem/,
  /^Nachfolgende Begriffe/,
]

const COLUMNAR_HEADERS = ["Buchung", "Valuta", "Transaktionsinformation", "Betrag"]

// ── Public API ────────────────────────────────────────────────────────────────

export function parseKontoauszug(text: string): ParsedKontoauszug {
  const allLines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)

  // ── 1. Extract header ─────────────────────────────────────────────────────
  let konto_iban = ""
  let periode = ""
  let periodeYear = 0
  let periodeMonth = 0
  let kontoinhaber = ""

  for (const line of allLines) {
    // Standalone IBAN line: "IBAN: DE78500240249610825030" (no BIC/amount after)
    // Also matches "IBAN:" with empty value (some PDFs lose the IBAN in extraction)
    const ibanM = line.match(/^IBAN:\s*(DE\S+)?\s*$/)
    if (ibanM && ibanM[1] && !konto_iban) konto_iban = ibanM[1]

    const perM = line.match(/Vorläufiger Kontoauszug (\d{2})\/(\d{4})/)
    if (perM && !periode) {
      periodeMonth = parseInt(perM[1])
      periodeYear = parseInt(perM[2])
      periode = `${periodeYear}-${perM[1]}`
    }

    if (!kontoinhaber && line.length > 0 && !line.match(/^\d/) && !line.match(/^[A-Z]{2}\d/)) {
      kontoinhaber = line
    }
  }

  if (!periode) {
    throw new Error("Kontoauszug-Format nicht erkannt (Periode fehlt)")
  }
  if (!konto_iban) {
    // Some PDFs don't expose the IBAN value during text extraction.
    // Fall back to a placeholder so import can proceed; duplicate detection
    // then falls back to (periode + filename) effectively.
    konto_iban = "UNKNOWN"
  }

  // ── 2. Parse transactions ─────────────────────────────────────────────────
  const transactions: KontoBankTransaction[] = []
  const parseErrors: string[] = []

  let i = 0
  while (i < allLines.length) {
    const line = allLines[i]

    // Skip known non-transaction lines and columnar headers
    if (shouldSkip(line) || COLUMNAR_HEADERS.includes(line)) { i++; continue }

    // Standalone IBAN header lines (no BIC on same line)
    if (line.match(/^IBAN:\s*DE\S+$/) && !line.includes("BIC:")) { i++; continue }

    // ── Inline format: "DD.MM. DD.MM. Type" ──────────────────────────────
    const inlineM = line.match(INLINE_DATE_RE)
    if (inlineM) {
      const buchDD = parseInt(inlineM[1])
      const buchMM = parseInt(inlineM[2])
      const valtDD = parseInt(inlineM[3])
      const valtMM = parseInt(inlineM[4])
      const typeStr = inlineM[5].trim()

      i++
      const details: string[] = []
      while (i < allLines.length) {
        const next = allLines[i]
        // Stop at next transaction header or section boundary
        if (next.match(INLINE_DATE_RE)) break
        if (next.match(DATE_ONLY_RE)) break
        if (next.startsWith("Zusammenfassung")) break
        if (COLUMNAR_HEADERS.includes(next)) { i++; continue }
        if (shouldSkip(next)) { i++; break }
        details.push(next)
        // Stop after the amount-bearing line (amount at end, or amount alone)
        if (next.match(AMOUNT_ONLY_RE) || next.match(AMOUNT_SUFFIX_RE)) { i++; break }
        i++
      }

      try {
        const tx = buildInlineTransaction(
          buchDD, buchMM, valtDD, valtMM, typeStr, details,
          periodeYear, periodeMonth
        )
        transactions.push(tx)
      } catch (e) {
        parseErrors.push(
          `Fehler bei Inline-Transaktion (${buchDD}.${buchMM}.): ${e instanceof Error ? e.message : String(e)}`
        )
      }
      continue
    }

    // ── Columnar format: consecutive "DD.MM." lines ───────────────────────
    if (line.match(DATE_ONLY_RE)) {
      const dateLinesRaw: string[] = [line]
      i++
      while (i < allLines.length && allLines[i].match(DATE_ONLY_RE)) {
        dateLinesRaw.push(allLines[i])
        i++
      }

      const bodyLines: string[] = []
      while (i < allLines.length) {
        const next = allLines[i]
        if (next.startsWith("Zusammenfassung")) break
        if (shouldSkip(next)) { i++; continue }
        if (COLUMNAR_HEADERS.includes(next)) { i++; continue }
        if (next.match(INLINE_DATE_RE)) break
        bodyLines.push(next)
        i++
      }

      const amounts: number[] = []
      if (i < allLines.length && allLines[i].startsWith("Zusammenfassung")) {
        const zLine = allLines[i]
        const re = new RegExp(ALL_AMOUNTS_RE.source, "g")
        let m
        while ((m = re.exec(zLine)) !== null) {
          amounts.push(parseAmountCents(m[1]))
        }
        i++
      }

      const N = Math.floor(dateLinesRaw.length / 2)
      if (N === 0) continue

      const buchDates = dateLinesRaw.slice(0, N)
      const valtDates = dateLinesRaw.slice(N, 2 * N)
      const groups = groupColumnarBodyLines(bodyLines, N)

      for (let j = 0; j < N; j++) {
        const bM = buchDates[j]?.match(DATE_ONLY_RE)
        const vM = valtDates[j]?.match(DATE_ONLY_RE)
        if (!bM || !vM) continue

        const buchDD = parseInt(bM[1]), buchMM = parseInt(bM[2])
        const valtDD = parseInt(vM[1]), valtMM = parseInt(vM[2])
        const group = groups[j] ?? []
        const typeStr = group[0] ?? "sonstige"
        const descLines = group.slice(1)
        const betragCents = amounts[j] ?? 0

        try {
          const tx = buildColumnarTransaction(
            buchDD, buchMM, valtDD, valtMM, typeStr, descLines, betragCents,
            periodeYear, periodeMonth
          )
          transactions.push(tx)
        } catch (e) {
          parseErrors.push(
            `Fehler bei Spalten-Transaktion (${buchDD}.${buchMM}.): ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      if (N > 0 && amounts.length < N) {
        parseErrors.push(
          `Columnar-Sektion: ${N} Transaktionen, nur ${amounts.length} Beträge gefunden`
        )
      }

      continue
    }

    i++
  }

  return { konto_iban, periode, kontoinhaber, transactions, parseErrors }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shouldSkip(line: string): boolean {
  return OUTER_SKIP_RE.some((re) => re.test(line))
}

function resolveYear(mm: number, periodeYear: number, periodeMonth: number): number {
  const diff = mm - periodeMonth
  if (diff > 6) return periodeYear - 1   // e.g., Dec transaction in Jan statement
  if (diff < -6) return periodeYear + 1  // e.g., Jan transaction in Dec statement
  return periodeYear
}

function toIsoDate(dd: number, mm: number, periodeYear: number, periodeMonth: number): string {
  const year = resolveYear(mm, periodeYear, periodeMonth)
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
}

function parseAmountCents(amtStr: string): number {
  const clean = amtStr.trim().replace(/\./g, "").replace(",", ".")
  return Math.round(parseFloat(clean) * 100)
}

function detectType(typeStr: string, betragCents: number): KontoBankTransaction["typ"] {
  if (betragCents > 0) return "gutschrift"
  const lower = typeStr.toLowerCase()
  if (lower.includes("kartenzahlung")) return "kartenzahlung"
  if (lower.includes("überweisung")) return "überweisung"
  if (lower.includes("lastschrift")) return "überweisung"
  return "sonstige"
}

function splitNameAndAmount(line: string): { name: string; betragCents: number } | null {
  const m = line.match(AMOUNT_SUFFIX_RE)
  if (!m) return null
  return { name: m[1].trim(), betragCents: parseAmountCents(m[2]) }
}

function buildInlineTransaction(
  buchDD: number, buchMM: number,
  valtDD: number, valtMM: number,
  typeStr: string,
  details: string[],
  periodeYear: number, periodeMonth: number
): KontoBankTransaction {
  const buchungsdatum = toIsoDate(buchDD, buchMM, periodeYear, periodeMonth)
  const valutadatum = toIsoDate(valtDD, valtMM, periodeYear, periodeMonth)

  if (details.length === 0) throw new Error("Keine Detail-Zeilen für Transaktion")

  const lastLine = details[details.length - 1]

  // The amount may be on its own line (modern PDF extraction) or appended
  // to the merchant/IBAN line (single-line extraction). Determine which.
  const amountOnlyM = lastLine.match(AMOUNT_ONLY_RE)
  let betrag_cents: number
  let nameFromLastLine: string
  let infoLine: string
  if (amountOnlyM) {
    betrag_cents = parseAmountCents(amountOnlyM[1])
    if (details.length < 2) throw new Error(`Kein Beschreibungs-Detail vor Betrag: "${lastLine}"`)
    infoLine = details[details.length - 2]
    nameFromLastLine = infoLine.trim()
  } else {
    const split = splitNameAndAmount(lastLine)
    if (!split) throw new Error(`Kein Betrag gefunden in: "${lastLine}"`)
    betrag_cents = split.betragCents
    infoLine = lastLine
    nameFromLastLine = split.name
  }

  const typ = detectType(typeStr, betrag_cents)
  const beschreibung = lastLine

  if (typ === "kartenzahlung" || typ === "gutschrift" || typ === "sonstige") {
    return {
      buchungsdatum, valutadatum, typ, beschreibung,
      haendler_name: nameFromLastLine || null,
      empfaenger_name: null, verwendungszweck: null, iban: null, bic: null,
      betrag_cents,
    }
  }

  // Überweisung: details[0]=empfaenger, [1..]=verwendungszweck + IBAN/BIC line.
  // The IBAN/BIC line is `infoLine` (either last line or second-to-last if
  // amount is standalone). Verwendungszweck = lines between empfaenger and infoLine.
  const detailsForUw = amountOnlyM ? details.slice(0, -1) : details
  const empfaenger_name = detailsForUw.length > 0 ? detailsForUw[0].trim() : null
  const vzLines = detailsForUw.length > 2 ? detailsForUw.slice(1, -1) : []
  const verwendungszweck = vzLines.join(" ").trim() || null

  const ibanM = infoLine.match(/IBAN:\s*(DE\S+)/)
  const bicM = infoLine.match(/BIC:\s*([A-Z]{6}[A-Z0-9]{2,5})/)

  return {
    buchungsdatum, valutadatum, typ, beschreibung,
    haendler_name: null,
    empfaenger_name,
    verwendungszweck,
    iban: ibanM ? ibanM[1].replace(/\s.*$/, "") : null,
    bic: bicM ? bicM[1] : null,
    betrag_cents,
  }
}

function buildColumnarTransaction(
  buchDD: number, buchMM: number,
  valtDD: number, valtMM: number,
  typeStr: string,
  descLines: string[],
  betragCents: number,
  periodeYear: number, periodeMonth: number
): KontoBankTransaction {
  const buchungsdatum = toIsoDate(buchDD, buchMM, periodeYear, periodeMonth)
  const valutadatum = toIsoDate(valtDD, valtMM, periodeYear, periodeMonth)
  const typ = detectType(typeStr, betragCents)
  const description = descLines.join(" ").trim()

  return {
    buchungsdatum, valutadatum, typ,
    beschreibung: description || typeStr,
    haendler_name: typ === "kartenzahlung" ? description || null : null,
    empfaenger_name: typ === "überweisung" ? description || null : null,
    verwendungszweck: null, iban: null, bic: null,
    betrag_cents: betragCents,
  }
}

function groupColumnarBodyLines(bodyLines: string[], N: number): string[][] {
  if (bodyLines.length === 0) return Array.from({ length: N }, () => [])

  const groups: string[][] = []
  let current: string[] = []

  for (const line of bodyLines) {
    const isType = KNOWN_TYPES.some((t) => line.startsWith(t))
    if (isType && current.length > 0) {
      groups.push(current)
      current = [line]
    } else {
      current.push(line)
    }
  }
  if (current.length > 0) groups.push(current)

  while (groups.length < N) groups.push([])
  return groups
}
