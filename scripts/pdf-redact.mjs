#!/usr/bin/env node
/**
 * pdf-redact.mjs — Entfernt Strings vollständig aus einer PDF-Datei
 *
 * Verwendung:
 *   node scripts/pdf-redact.mjs <input.pdf> <output.pdf> "String1" "String2" ...
 *
 * Nutzt MuPDF mit echter PDF-Redaction:
 *   - Sucht Strings unter Berücksichtigung des Font-Encodings (auch Glyph-Indizes)
 *   - Entfernt den Text aus dem Content Stream (nicht nur visuell)
 *   - Strings sind danach weder sichtbar noch per Copy/Paste extrahierbar
 */

import { readFileSync, writeFileSync } from 'fs'
import * as mupdf from 'mupdf'

const args = process.argv.slice(2)
if (args.length < 3) {
  console.error('Verwendung: node pdf-redact.mjs <input.pdf> <output.pdf> "String1" "String2" ...')
  process.exit(1)
}

const [inputPath, outputPath, ...targets] = args

console.log(`Input:  ${inputPath}`)
console.log(`Output: ${outputPath}`)
console.log(`Strings (${targets.length}):`)
targets.forEach(t => console.log(`  - "${t}"`))
console.log()

const buffer = readFileSync(inputPath)
const doc = mupdf.PDFDocument.openDocument(buffer, 'application/pdf')

const pageCount = doc.countPages()
let totalHits = 0

for (let i = 0; i < pageCount; i++) {
  const page = doc.loadPage(i)

  for (const target of targets) {
    const hits = page.search(target) // Quad[][] — eine Liste von Quad-Listen pro Match
    if (!hits || hits.length === 0) continue

    for (const quads of hits) {
      // Quads zu einer Bounding-Box zusammenfassen (Match kann mehrere Quads umfassen)
      const rect = quadsToRect(quads)
      const annot = page.createAnnotation('Redact')
      annot.setRect(rect)
      totalHits++
    }

    console.log(`  Seite ${i + 1}: "${target}" — ${hits.length} Match(es)`)
  }

  // Redactions anwenden:
  //  - black_boxes=false → weiße Lücke statt schwarzer Block
  //  - text_method=REDACT_TEXT_REMOVE (0) → Text wirklich aus Content Stream entfernen
  page.applyRedactions(
    false,
    mupdf.PDFPage.REDACT_IMAGE_NONE,
    mupdf.PDFPage.REDACT_LINE_ART_NONE,
    mupdf.PDFPage.REDACT_TEXT_REMOVE,
  )
}

console.log(`\nGesamt: ${totalHits} Treffer redaktiert`)

if (totalHits === 0) {
  console.log('Keine Strings gefunden. Suche ist case-sensitiv und akzentsensitiv.')
}

const outBuffer = doc.saveToBuffer('garbage=2')
writeFileSync(outputPath, outBuffer.asUint8Array())

console.log(`Gespeichert: ${outputPath}`)

// ---

/** Vereint mehrere Quads zu einem umschließenden Rect [x0, y0, x1, y1]. */
function quadsToRect(quads) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const q of quads) {
    // Quad: [ul_x, ul_y, ur_x, ur_y, ll_x, ll_y, lr_x, lr_y]
    for (let i = 0; i < 8; i += 2) {
      const x = q[i]
      const y = q[i + 1]
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
  }
  return [x0, y0, x1, y1]
}
