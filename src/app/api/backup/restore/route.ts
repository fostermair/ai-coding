import { NextRequest, NextResponse } from "next/server"
import { closeDb, getDb } from "@/lib/db"
import path from "path"
import fs from "fs"
import os from "os"
import { createReadStream } from "fs"
import { promisify } from "util"
import { exec } from "child_process"

const execPromise = promisify(exec)

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  let tempDir: string | null = null

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "Kein Datei hochgeladen" }, { status: 400 })
    }

    // Create temp directory for extraction
    tempDir = path.join(os.tmpdir(), `backup-restore-${Date.now()}`)
    fs.mkdirSync(tempDir, { recursive: true })

    // Save uploaded ZIP to temp
    const zipPath = path.join(tempDir, "backup.zip")
    const buffer = await file.arrayBuffer()
    fs.writeFileSync(zipPath, new Uint8Array(buffer))

    // Validate ZIP contains required files
    const manifestPath = path.join(tempDir, "MANIFEST.md")
    const dbPath = path.join(tempDir, "ebon.db")

    // Extract ZIP (cross-platform)
    const extractDir = path.join(tempDir, "extracted")
    fs.mkdirSync(extractDir, { recursive: true })

    // Use unzip command (available on all platforms)
    try {
      await execPromise(`unzip -q "${zipPath}" -d "${extractDir}"`)
    } catch (err) {
      return NextResponse.json(
        { error: "Backup ungültig oder beschädigt" },
        { status: 400 }
      )
    }

    // Check required files exist in extraction
    const extractedDbPath = path.join(extractDir, "ebon.db")
    const extractedManifestPath = path.join(extractDir, "MANIFEST.md")

    if (!fs.existsSync(extractedDbPath) || !fs.existsSync(extractedManifestPath)) {
      return NextResponse.json(
        { error: "Backup ungültig oder beschädigt" },
        { status: 400 }
      )
    }

    // Validate extracted DB file is a valid SQLite database
    if (!isValidSqliteDb(extractedDbPath)) {
      return NextResponse.json(
        { error: "Backup ungültig oder beschädigt" },
        { status: 400 }
      )
    }

    // Get current DB path
    const db = getDb()
    const currentDbPath = db.name
    const dataDir = path.dirname(currentDbPath)

    // Close database before replacing
    closeDb()

    // Atomic replacement: rename old files to .old, move new files in
    try {
      const backupExt = ".backup-" + Date.now()

      // Backup current db
      if (fs.existsSync(currentDbPath)) {
        fs.renameSync(currentDbPath, currentDbPath + backupExt)
      }

      // Backup WAL files if they exist
      const walPath = currentDbPath + "-wal"
      const shmPath = currentDbPath + "-shm"
      if (fs.existsSync(walPath)) {
        fs.renameSync(walPath, walPath + backupExt)
      }
      if (fs.existsSync(shmPath)) {
        fs.renameSync(shmPath, shmPath + backupExt)
      }

      // Move extracted DB
      fs.copyFileSync(extractedDbPath, currentDbPath)

      // Handle directories: rename old, move new
      const dirs = ["ebons", "avis", "konto"]
      for (const dir of dirs) {
        const oldPath = path.join(dataDir, dir)
        const extractedPath = path.join(extractDir, dir)

        // Rename old if exists
        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, oldPath + backupExt)
        }

        // Move extracted if exists
        if (fs.existsSync(extractedPath)) {
          fs.cpSync(extractedPath, oldPath, { recursive: true, force: true })
        }
      }

      // Clean up backups after successful restore
      const files = fs.readdirSync(dataDir)
      files.forEach((file) => {
        if (file.endsWith(backupExt)) {
          try {
            const filePath = path.join(dataDir, file)
            if (fs.lstatSync(filePath).isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true })
            } else {
              fs.unlinkSync(filePath)
            }
          } catch (e) {
            console.warn(`Could not clean up backup file: ${file}`)
          }
        }
      })

      // Re-open database to verify it works
      const newDb = getDb()
      newDb.prepare("SELECT COUNT(*) FROM receipts").get()

      // Log the restore
      newDb
        .prepare(`INSERT INTO import_log (filename, status, message) VALUES (?, ?, ?)`)
        .run(file.name, "backup_restored", `Backup restored from: ${file.name}`)

      return NextResponse.json({
        success: true,
        message: "Backup wiederhergestellt. Die App wird neu geladen.",
      })
    } catch (err) {
      console.error("[restore] Atomic replace failed:", err)

      // Try to recover: restore from backups
      try {
        const backupExt = ".backup-" + Date.now()
        const files = fs.readdirSync(dataDir)
        files.forEach((file) => {
          if (file.endsWith(backupExt)) {
            const source = path.join(dataDir, file)
            const target = path.join(dataDir, file.replace(backupExt, ""))
            try {
              if (fs.lstatSync(source).isDirectory()) {
                fs.rmSync(target, { recursive: true, force: true })
                fs.renameSync(source, target)
              } else {
                fs.renameSync(source, target)
              }
            } catch (e) {
              console.warn(`Could not restore backup: ${file}`)
            }
          }
        })
      } catch (recoverErr) {
        console.error("[restore] Recovery failed:", recoverErr)
      }

      // Reopen DB
      getDb()

      return NextResponse.json(
        { error: "Fehler beim Wiederherstellen des Backups. Alte Daten wurden wiederhergestellt." },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("[restore] Error restoring backup:", error)
    return NextResponse.json(
      { error: "Fehler beim Verarbeiten des Backups" },
      { status: 500 }
    )
  } finally {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

function isValidSqliteDb(filePath: string): boolean {
  try {
    const header = Buffer.alloc(16)
    const fd = fs.openSync(filePath, "r")
    fs.readSync(fd, header, 0, 16, 0)
    fs.closeSync(fd)

    // SQLite header magic bytes
    const magic = header.toString("utf-8", 0, 13)
    return magic === "SQLite format"
  } catch {
    return false
  }
}
