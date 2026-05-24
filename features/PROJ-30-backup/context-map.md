# Context Map: PROJ-30 Backup & Restore

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|---|
| `src/components/config-dialog.tsx` | Erweitert | Neue "Datenbackup" Sektion mit Create/Restore Buttons; `ConfirmType` um "restore" erweitert |
| `src/app/api/backup/route.ts` | Neu erstellt | GET /api/backup — VACUUM INTO, ZIP assembly, streaming response |
| `src/app/api/backup/restore/route.ts` | Neu erstellt | POST /api/backup/restore — ZIP validation, atomic file replacement |
| `src/lib/db.ts` | Nur lesen | `getDb()`, `closeDb()`, `DEFAULT_DB_PATH`, WAL mode handling |
| `src/components/export-dialog.tsx` | Nur lesen | Pattern für Blob-Download via fetch |
| `src/app/api/export/csv/route.ts` | Nur lesen | Pattern für File-Download API Route |

## Kritische Typen & Interfaces

### config-dialog.tsx
```typescript
type ConfirmType = "avis" | "alias" | "konto" | "bons" | "restore" | null;

// State added:
const [backupLoading, setBackupLoading] = useState(false);
const [restoreLoading, setRestoreLoading] = useState(false);
const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
const pendingFileRef = useRef<File | null>(null);
```

### API Response Shapes
```
GET /api/backup
→ ReadableStream<Uint8Array>
→ Headers: Content-Type: application/zip, Content-Disposition: attachment; filename="exbon-backup-YYYY-MM-DD.zip"

POST /api/backup/restore
← FormData { file: File (ZIP) }
→ { success: boolean, message: string } (on success)
→ { error: string } (on error)
```

## Nicht-lesen-Liste

- `src/app/api/bons/` — nicht relevant, separate domain
- `src/app/api/avis/` — nicht relevant, separate domain
- `src/app/api/konto/` — nicht relevant, separate domain
- `src/app/api/produkte/` — nicht relevant, separate domain
- `tests/` — E2E test directory nicht relevant für diese Feature
- `.next/` — build output
- `node_modules/` — dependencies

## Tests

### Bestehende Tests
Keine Tests vorhanden für die config-dialog.tsx (keine Test-Datei gefunden).

### Neue Tests (zu erstellen)

| Datei | Typ | Purpose |
|-------|-----|---------|
| `src/app/api/backup/route.test.ts` | Unit | GET /api/backup: ZIP headers, MANIFEST presence, temp file cleanup |
| `src/app/api/backup/restore/route.test.ts` | Unit | POST /api/backup/restore: valid ZIP, invalid ZIP, missing manifest, atomic replacement |

### Test Coverage

**GET /api/backup:**
- ✓ Response has correct content-type: application/zip
- ✓ Response has correct content-disposition header with filename
- ✓ ZIP contains ebon.db file
- ✓ ZIP contains MANIFEST.md file
- ✓ ZIP contains ebons/, avis/, konto/ directories if they exist
- ✓ Temp file is cleaned up after streaming

**POST /api/backup/restore:**
- ✓ Returns 400 if no file uploaded
- ✓ Returns 400 if ZIP is invalid
- ✓ Returns 400 if MANIFEST.md missing
- ✓ Returns 400 if ebon.db missing
- ✓ Validates SQLite magic bytes in extracted DB
- ✓ Atomically replaces old files with new files
- ✓ Cleans up .backup-* files after successful restore
- ✓ Logs operation in import_log table
- ✓ Returns 500 with recovery message on mid-restore failure
- ✓ Temp directory cleaned up in finally block

**Frontend (config-dialog.tsx):**
- ✓ "Letztes Backup:" timestamp displays correctly
- ✓ "Kein Backup vorhanden" shows initially
- ✓ Backup erstellen button triggers GET /api/backup
- ✓ Browser download occurs with correct filename
- ✓ Timestamp updates in localStorage and UI after download
- ✓ Backup laden file input opens file picker
- ✓ AlertDialog confirmation shows before restore
- ✓ Restore triggers POST /api/backup/restore on confirm
- ✓ Success message shows and page reloads
- ✓ Error message shows on invalid/corrupt ZIP
- ✓ All buttons disabled during backup/restore operations

## Implementation Notes

- Last backup timestamp stored in `localStorage['lastBackupTimestamp']` — no DB migration needed
- `unzip` command used for extraction (cross-platform available on Windows, macOS, Linux)
- Database closed with `closeDb()` before atomic file replacement to avoid locks
- Backup files use `.backup-TIMESTAMP` extension for safe rollback
- MANIFEST.md contains creation time, version, and restore instructions (human-readable)
- `archiver` streams ZIP — no buffering large files in memory
- `VACUUM INTO` creates WAL-safe snapshot without including -wal/-shm files
