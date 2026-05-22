import type Database from "better-sqlite3"

export interface MatchResult {
  transactionId: number
  outcome: 'matched' | 'pending' | 'virtual'
  receiptId?: number
  candidateIds?: number[]
}

export interface MatchingSummary {
  matched: number
  pending: number
  virtual: number
  skipped: number
}

interface TxRow {
  id: number
  buchungsdatum: string
  betrag_cents: number
  typ: string
  beschreibung: string
  haendler_name: string | null
  empfaenger_name: string | null
  match_status: string
  match_source: string | null
}

interface ReceiptCandidate {
  id: number
  store_chain: string
  total_amount_cents: number
}

// Supermarket chains recognizable in bank descriptions
const CHAIN_KEYWORDS: Record<string, string> = {
  REWE: 'rewe',
  LIDL: 'lidl',
  KAUFLAND: 'kaufland',
  EDEKA: 'edeka',
  ALDI: 'aldi',
  PENNY: 'penny',
  NETTO: 'netto',
}

function detectChain(beschreibung: string): string | null {
  const upper = beschreibung.toUpperCase()
  for (const [keyword, chain] of Object.entries(CHAIN_KEYWORDS)) {
    if (upper.includes(keyword)) return chain
  }
  return null
}

export function runMatching(db: Database.Database): MatchingSummary {
  const summary: MatchingSummary = { matched: 0, pending: 0, virtual: 0, skipped: 0 }

  const openTxs = db
    .prepare(
      `SELECT id, buchungsdatum, betrag_cents, typ, beschreibung, haendler_name, empfaenger_name, match_status, match_source
       FROM bank_transactions
       WHERE match_status IN ('unmatched', 'pending')
         AND typ IN ('kartenzahlung', 'überweisung')`
    )
    .all() as TxRow[]

  const updateMatched = db.prepare(
    `UPDATE bank_transactions SET match_status = 'matched', matched_receipt_id = ?, match_source = 'auto' WHERE id = ?`
  )
  const updatePending = db.prepare(
    `UPDATE bank_transactions SET match_status = 'pending' WHERE id = ?`
  )
  const updateVirtual = db.prepare(
    `UPDATE bank_transactions SET match_status = 'virtual', matched_receipt_id = ?, match_source = 'auto' WHERE id = ?`
  )
  const insertVirtual = db.prepare(
    `INSERT INTO receipts (filename, store_name, store_chain, receipt_date, total_amount_cents, payment_method, is_virtual, bank_transaction_id, imported_at)
     VALUES ('[virtual]', ?, ?, ?, ?, ?, 1, ?, datetime('now'))`
  )
  const linkReceipt = db.prepare(
    `UPDATE receipts SET bank_transaction_id = ? WHERE id = ?`
  )

  for (const tx of openTxs) {
    // Skip already manually assigned
    if (tx.match_status === 'matched' && tx.match_source === 'manual') {
      summary.skipped++
      continue
    }

    const absBetrag = Math.abs(tx.betrag_cents)

    // Find receipts within ±1 day with same amount
    let candidates = db
      .prepare(
        `SELECT id, store_chain, total_amount_cents FROM receipts
         WHERE receipt_date BETWEEN date(?, '-1 day') AND date(?, '+1 day')
           AND total_amount_cents = ?
           AND is_virtual = 0`
      )
      .all(tx.buchungsdatum, tx.buchungsdatum, absBetrag) as ReceiptCandidate[]

    // Apply chain filter for kartenzahlung — always apply, even if it yields 0 results
    if (tx.typ === 'kartenzahlung') {
      const chain = detectChain(tx.beschreibung)
      if (chain) {
        candidates = candidates.filter((c) => c.store_chain === chain)
      }
    }

    db.transaction(() => {
      if (candidates.length === 1) {
        // Auto-match
        updateMatched.run(candidates[0].id, tx.id)
        linkReceipt.run(tx.id, candidates[0].id)
        summary.matched++
      } else if (candidates.length > 1) {
        // Multiple candidates → pending
        updatePending.run(tx.id)
        summary.pending++
      } else {
        // No candidates → create virtual bon (only if none exists yet)
        const existingVirtual = db
          .prepare(`SELECT id FROM receipts WHERE bank_transaction_id = ? AND is_virtual = 1`)
          .get(tx.id) as { id: number } | undefined
        if (!existingVirtual) {
          const haendler = tx.haendler_name || tx.empfaenger_name || tx.beschreibung.slice(0, 50)
          const chain = detectChain(tx.beschreibung) ?? 'sonstige'
          const result = insertVirtual.run(haendler, chain, tx.buchungsdatum, absBetrag, tx.typ, tx.id)
          const virtualId = result.lastInsertRowid as number
          updateVirtual.run(virtualId, tx.id)
        } else {
          updateVirtual.run(existingVirtual.id, tx.id)
        }
        summary.virtual++
      }
    })()
  }

  return summary
}

/**
 * Called after a new real bon is imported.
 * Looks for open/virtual transactions that match the new bon and links them.
 */
export function rematchAfterBonImport(
  db: Database.Database,
  newReceiptId: number,
  receiptDate: string,
  totalAmountCents: number,
  storeChain: string
): void {
  const openTxs = db
    .prepare(
      `SELECT id, buchungsdatum, betrag_cents, beschreibung, match_status, match_source, matched_receipt_id
       FROM bank_transactions
       WHERE match_status IN ('unmatched', 'virtual')
         AND match_source IS NOT 'manual'
         AND ABS(betrag_cents) = ?
         AND buchungsdatum BETWEEN date(?, '-1 day') AND date(?, '+1 day')`
    )
    .all(totalAmountCents, receiptDate, receiptDate) as Array<{
      id: number
      buchungsdatum: string
      betrag_cents: number
      beschreibung: string
      match_status: string
      match_source: string | null
      matched_receipt_id: number | null
    }>

  for (const tx of openTxs) {
    // Check chain compatibility
    const detectedChain = detectChain(tx.beschreibung)
    if (detectedChain && detectedChain !== storeChain) continue

    db.transaction(() => {
      // Delete virtual bon if it exists — clear FK reference first to avoid constraint violation
      if (tx.match_status === 'virtual' && tx.matched_receipt_id) {
        db.prepare("UPDATE bank_transactions SET matched_receipt_id = NULL WHERE id = ?").run(tx.id)
        db.prepare("DELETE FROM receipts WHERE id = ? AND is_virtual = 1").run(tx.matched_receipt_id)
      }

      // Link transaction to new real bon
      db.prepare(
        `UPDATE bank_transactions SET match_status = 'matched', matched_receipt_id = ?, match_source = 'auto' WHERE id = ?`
      ).run(newReceiptId, tx.id)

      db.prepare("UPDATE receipts SET bank_transaction_id = ? WHERE id = ?").run(tx.id, newReceiptId)
    })()
  }
}
