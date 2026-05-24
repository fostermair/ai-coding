# PROJ-30: Backup & Restore

**Status:** In Progress  
**Created:** 2026-05-24  
**Priority:** P1

## Summary
Users need to back up their local data (receipts, aliases, bank transactions, PDFs) and restore from backups. This feature adds a "Backup erstellen" button and "Backup wiederherstellen" file upload in the settings page, allowing users to download a single ZIP file and upload it later to recover all data.

## Problem Statement
- User data is stored **only locally** in `data/ebon.db` and source PDF files
- No backup mechanism exists
- If the database is corrupted or accidentally deleted, all imported data is lost
- Users have no way to migrate data to another computer

## User Stories

### Story 1: Create Backup
As a user, I want to download a ZIP backup of all my data (receipts, PDFs, aliases) so that I can protect against data loss.

**Acceptance Criteria:**
- [ ] "Backup erstellen" button exists in the settings page (Konfigurations-Menü)
- [ ] Clicking the button downloads `exbon-backup-YYYY-MM-DD.zip` (e.g., `exbon-backup-2026-05-24.zip`)
- [ ] ZIP contains:
  - `ebon.db` (the SQLite database with all tables)
  - `ebons/` directory with all receipt PDFs (REWE, Lidl, Kaufland)
  - `avis/` directory with all AVIS PDFs
  - `konto/` directory with all bank statement files
  - A `MANIFEST.md` file listing what's in the backup (version, creation date, file count)
- [ ] ZIP is created **without** temporary files on disk (streamed to client)
- [ ] Backup works even if the database is in use (DB is locked by the app)
- [ ] User sees a brief success message ("Backup erstellt")

### Story 2: Restore Backup
As a user, I want to upload a previously downloaded backup ZIP to restore all my data, so that I can recover from data loss or migrate to another computer.

**Acceptance Criteria:**
- [ ] "Backup wiederherstellen" file upload exists in the settings page
- [ ] User can select a `.zip` file
- [ ] Before restore, the app shows a **warning dialog**: "Warnung: Alle aktuellen Daten werden überschrieben. Dieser Vorgang kann nicht rückgängig gemacht werden. Fortfahren?"
- [ ] User must explicitly confirm before restore proceeds
- [ ] On restore:
  - The app **stops serving requests** (or queues them) to prevent DB access during restore
  - ZIP is extracted and validated (must contain `ebon.db` and expected directories)
  - Old `data/ebon.db*` files are replaced with backup versions
  - Old `data/ebons/`, `data/avis/`, `data/konto/` are replaced with backup versions
  - App automatically reloads
- [ ] If ZIP is invalid or corrupted:
  - Restore is cancelled (nothing is modified)
  - User sees error: "Backup ungültig oder beschädigt"
- [ ] If ZIP is from an incompatible version:
  - Show warning: "Dieses Backup stammt aus einer anderen App-Version. Fortfahren?" (allow override)
- [ ] Success message: "Backup wiederhergestellt. Die App wird neu geladen."

### Story 3: Last Backup Timestamp
As a user, I want to see when the last backup was created, so that I know whether I have a recent backup.

**Acceptance Criteria:**
- [ ] Settings page shows "Letztes Backup: 2026-05-24 14:30" or "Kein Backup vorhanden"
- [ ] Timestamp is updated after each successful backup download
- [ ] Timestamp persists (stored in localStorage or a simple meta table)

## Edge Cases & Constraints

### Database Consistency
- The main database uses SQLite WAL mode (`data/ebon.db-shm` and `ebon.db-wal` files)
- Backup must include all three files (`ebon.db`, `ebon.db-shm`, `ebon.db-wal`) OR must cleanly checkpoint the DB first (e.g., `VACUUM INTO`) to avoid corruption
- **Choice: Use `VACUUM INTO` to create a clean copy, do NOT include WAL files in ZIP** (simpler, safer, avoids checksums)

### File Access During Restore
- The app is still running when user uploads the ZIP
- Need to prevent the app from reading/writing `data/` during restore
- **Approach:** Restore happens synchronously on the API route, then client is instructed to reload
- If restore fails mid-way, the app is in an inconsistent state → must allow user to restart manually

### Sensitive Data
- `.env` is NOT included in backup (contains API tokens for Paperless-ngx, etc.)
- Backup should be safe to store/email (no credentials)

### What's Excluded from Backup
- `data/test-*.db` — test databases only
- `node_modules/`, `.git/`, source code
- `.env` (sensitive configuration)

## Technical Design (High-Level)

### API: GET /api/backup
**Purpose:** Create and stream a backup ZIP.

**Logic:**
1. Receive GET request
2. Create a clean DB snapshot:
   - Call `VACUUM INTO 'temp-backup.db'` to create a copy without WAL files
   - (Alternative: use `better-sqlite3` to trigger a checkpoint, then copy the three DB files)
3. Create ZIP in memory using `archiver` or `jszip`:
   - Add `temp-backup.db` as `ebon.db`
   - Recursively add `data/ebons/`, `data/avis/`, `data/konto/`
   - Add `MANIFEST.md` with metadata
4. Stream ZIP to client with Content-Disposition header: `attachment; filename="exbon-backup-YYYY-MM-DD.zip"`
5. Clean up temp file

**Response:**
- Status: 200 (ZIP stream)
- Headers: `Content-Type: application/zip`, `Content-Disposition: attachment`

### API: POST /api/backup/restore
**Purpose:** Accept ZIP upload and restore data.

**Logic:**
1. Receive multipart FormData with file
2. Validate ZIP:
   - Must contain `ebon.db` and `MANIFEST.md`
   - Extract `MANIFEST.md` and check version (allow mismatch with warning, but log it)
3. Extract ZIP to a temp directory
4. Validate extracted files (ebon.db is a valid SQLite file)
5. **Atomic replace:**
   - Rename current `data/ebon.db` to `ebon.db.old` (backup the old one)
   - Move extracted `ebon.db` to `data/ebon.db`
   - Replace `data/ebons/`, `data/avis/`, `data/konto/` with extracted versions
6. Return success response with instruction to reload
7. Clean up temp directory and `ebon.db.old`

**Response:**
- Status: 200 with body: `{ success: true, message: "Backup wiederhergestellt" }`
- On error: Status 400 with body: `{ success: false, message: "Backup ungültig..." }`

### UI: Settings Page Component (extends PROJ-22)
**Location:** Existing settings/config page (file TBD, likely `src/app/settings/page.tsx` or similar)

**Add new card:**
```
┌─────────────────────────────┐
│ 💾 Datenbackup              │
│                             │
│ Letztes Backup: 2026-05-24  │
│ [Backup erstellen]          │
│ [Backup wiederherstellen]   │
│                             │
│ Info: Sichert alle Bons,    │
│ Aliases und Transaktionen   │
└─────────────────────────────┘
```

**Actions:**
1. **Backup erstellen:** Click button → `GET /api/backup` → ZIP downloads as `exbon-backup-YYYY-MM-DD.zip`
2. **Backup wiederherstellen:** File input → select ZIP → Click "Wiederherstellen"
   - Show warning modal before POST
   - On success: reload page
   - On error: show error toast

### Manifest Format
File: `MANIFEST.md` inside the ZIP

```markdown
# Backup Manifest

**Created:** 2026-05-24 14:30 UTC  
**App Version:** 2.5.0  
**SQLite Version:** 3.45.0  

## Contents
- ebon.db: SQLite database (receipts, aliases, transactions)
- ebons/: 10 receipt PDFs (REWE, Lidl, Kaufland)
- avis/: 4 AVIS PDFs
- konto/: 2 bank statement files

## Restore Instructions
1. Download and save this backup file
2. In Settings → "Backup wiederherstellen", select this ZIP
3. Confirm the warning
4. The app will reload with restored data
```

## Implementation Notes
- **Language:** German UI labels (Backup erstellen, Backup wiederherstellen, etc.)
- **ZIP Library:** Use `archiver` (if available) or `jszip` (lighter dependency)
- **Database Snapshot:** Use `VACUUM INTO` (SQLite 3.27+) to avoid WAL file complexity
- **Error Handling:** Show user-friendly error messages in German
- **Logging:** Log all backup/restore operations to the import_log table (new record type: "backup_created", "backup_restored")

## Testing Checklist (for /qa)
- [ ] Backup downloads with correct filename format
- [ ] ZIP contains all expected files and directories
- [ ] ZIP is not corrupted (can be extracted on another computer)
- [ ] Restore replaces data correctly
- [ ] Restore shows warning and requires confirmation
- [ ] Invalid/corrupted ZIP is rejected
- [ ] Database is not locked during backup (WAL mode doesn't block reads)
- [ ] App automatically reloads after restore
- [ ] Last backup timestamp updates and persists
- [ ] Backup works if receipts/aliases were just modified
- [ ] Restoring an old backup loses newer data (expected behavior, but documented)

## Dependencies
- Requires: `archiver` npm package (or `jszip` alternative)
- Does NOT require new database migrations
- Does NOT block other features

## Related Features
- PROJ-22: Konfigurations-Menü (settings page where UI lives)
- PROJ-7: Datenexport (CSV/XLSX export — different from backup, complements it)
