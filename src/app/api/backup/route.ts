import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import path from "path"
import fs from "fs"
import os from "os"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  let tempDbPath: string | null = null

  try {
    // Dynamic import to handle module loading
    const { Archiver } = await import("archiver")

    const db = getDb()
    const dbPath = db.name
    const dataDir = path.dirname(dbPath)

    // Create a temp file for VACUUM INTO
    const tempDir = os.tmpdir()
    tempDbPath = path.join(tempDir, `ebon-backup-${Date.now()}.db`)

    // VACUUM INTO creates a clean copy without WAL files
    db.exec(`VACUUM INTO '${tempDbPath.replace(/\\/g, "\\\\")}'`)

    // Create the manifest
    const now = new Date()
    const manifest = `# EXBON Backup Manifest

**Created:** ${now.toISOString()}
**Version:** 1.0

## Contents
- \`ebon.db\` — SQLite database
- \`ebons/\` — eBon PDF files
- \`avis/\` — AVIS PDF files
- \`konto/\` — Bank statement files

## Restore Instructions
1. Download this backup ZIP
2. Open the app Settings (gear icon)
3. Click "Backup wiederherstellen"
4. Select this ZIP file and confirm
5. The app will reload with the restored data

## Database Info
- SQLite version: ${db.prepare("SELECT sqlite_version()").get() as any}
- Tables: ${
      (
        db
          .prepare(
            "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
          )
          .get() as any
      ).count
    }
`

    // Create ZIP in memory using archiver
    const zipFileName = `exbon-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.zip`

    // Use ReadableStream with archiver
    const archive = new Archiver("zip", { zlib: { level: 6 } })

    // Create a custom response body
    const readableStream = new ReadableStream<Uint8Array>({
      start(controller) {
        archive.on("data", (data: Buffer) => {
          controller.enqueue(new Uint8Array(data))
        })

        archive.on("end", () => {
          controller.close()
          // Clean up temp file after streaming completes
          setTimeout(() => {
            if (tempDbPath && fs.existsSync(tempDbPath)) {
              fs.unlinkSync(tempDbPath)
            }
          }, 100)
        })

        archive.on("error", (err: Error) => {
          controller.error(err)
          // Clean up on error
          if (tempDbPath && fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath)
          }
        })

        // Add files to archive
        try {
          // Add the vacuumed DB snapshot
          archive.file(tempDbPath, { name: "ebon.db" })

          // Add directories if they exist
          const ebonsDir = path.join(dataDir, "ebons")
          const avisDir = path.join(dataDir, "avis")
          const kontoDir = path.join(dataDir, "konto")

          if (fs.existsSync(ebonsDir)) {
            archive.directory(ebonsDir, "ebons")
          }
          if (fs.existsSync(avisDir)) {
            archive.directory(avisDir, "avis")
          }
          if (fs.existsSync(kontoDir)) {
            archive.directory(kontoDir, "konto")
          }

          // Add manifest
          archive.append(manifest, { name: "MANIFEST.md" })

          // Finalize the archive
          archive.finalize()
        } catch (err) {
          controller.error(err)
          if (tempDbPath && fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath)
          }
        }
      },
    })

    // Log the backup creation
    db.prepare(
      `INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)`
    ).run(zipFileName, "backup_created", `Backup created: ${zipFileName}`)

    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFileName}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (error) {
    console.error("[backup] Error creating backup:", error)
    // Clean up temp file on error
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath)
    }
    return NextResponse.json(
      { error: "Fehler beim Erstellen des Backups" },
      { status: 500 }
    )
  }
}
