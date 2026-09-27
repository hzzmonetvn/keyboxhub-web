# AGENT.md - System Architecture & Developer Guide

This document is written specifically for AI agents and developers who maintain, extend, or debug this codebase. It provides a complete reference for the system architecture, business rules, API contracts, database schema, operational procedures, and background workflows.

---

## 1. Executive Summary & Live Deployment

- **Project Purpose**: High-availability Keybox Hub & Attestation Engine for Android Play Integrity (custom ROMs, Magisk, KernelSU, TrickyStore).
- **Public URL**: `https://keybox.hzzmonet.io.vn`
- **Internal Service**: Node.js v22+ running Express on `127.0.0.1:8098`.
- **Reverse Proxy**: Caddy server (`/etc/caddy/Caddyfile`) with automatic Let's Encrypt TLS reverse proxying to port 8098.
- **Service Manager**: systemd service unit at `/etc/systemd/system/keybox.service`.
- **Working Directory**: `/home/opc/keybox`
- **Database**: Embedded SQLite via `better-sqlite3` in WAL mode at `/home/opc/keybox/data/keybox.db`.

---

## 2. Core Business Rules & Principles

Any modification to the system **must respect these non-negotiable rules**:

1. **Google CRL Freshness**:
   - All keybox evaluations (on upload, on periodic 1h check, on 3rd-party loot, or manual check) **must fetch the latest CRL directly from Google** (`https://android.googleapis.com/attestation/status` and `.../root`) with cache-busting timestamps (`?ts=...`). Never evaluate keys solely against static or stale data.

2. **Strict Priority on Download (`GET /api/download`)**:
   - **Strong Integrity First**: If one or more `status = 'strong'` keys exist in the database, the download API **must randomly pick from the Strong keys only**.
   - **Device Fallback**: The API only falls back to random `status = 'device'` keys when there are zero `strong` keys available.
   - **Banned Response**: If all keys are revoked or no keys exist, return HTTP 404 with `status = "banned"`.

3. **24-Hour Banned Key Purge Policy**:
   - When a key fails attestation or Google revokes its certificates, its status is changed to `'banned'` and `banned_at` is stamped with the current ISO timestamp.
   - **Banned keys are preserved for exactly 24 hours** so users and clients can inspect which keys were revoked and when.
   - Once `banned_at <= now - 24 hours`, the background job automatically and permanently deletes them (`DELETE FROM keyboxes WHERE status = 'banned' AND banned_at <= ...`).
   - **Valid keys (`strong` or `device`) are NEVER deleted automatically.**

4. **Duplicate Prevention by Leaf Certificate Serial (Skip on Match)**:
   - When importing or uploading keys (single file, multi-file, ZIP archive, URL link, or 3rd-party looter):
     - **Check 1: Leaf Certificate Serial Match**: Extracts all leaf certificate serials (raw hex, unpadded hex without leading zeros, and decimal). Checks against existing keys using SQLite `json_each(k.serials)`. If ANY leaf serial matches an existing keybox, **the system skips insertion** (`skipped: true`). This prevents duplicates even if the uploader or source renamed `<Keybox DeviceID="...">` (e.g. Yurikey58, Yurikey59, ASUS-..., tryigit.dev).
     - **Check 2: Certificate Hash Match**: Computes deterministic SHA-256 hash of certificate chains and algorithms (independent of `deviceId`).
     - **Check 3: DeviceID Match**: Case-insensitive comparison against existing non-generic Device IDs.
   - If any check matches an existing keybox, **the system must SKIP insertion** (`skipped: true`) without modifying existing reports or creating duplicates.

5. **Specter Catalog Integration & Softban Detection**:
   - `trust-manager.js` periodically pulls Specter's live catalog (`https://rawbin.dpejoh.com/catalog`).
   - Leaf certificate serials are cross-referenced with catalog entries.
   - If an entry has `"softbanned": true`:
     - The key **cannot achieve Strong Integrity** (Google Play Integrity will fail STRONG).
     - Status is capped/downgraded to `'device'`, and `is_softbanned = 1`.
     - `source-fetcher.js` rejects candidate keys with `isSoftbanned === true` from looting as Strong.
     - The Web UI displays a distinct `Device (Softban)` badge with informative tooltip.

6. **Report-to-Device Transition**:
   - Keys uploaded or looted initially default to `'strong'` (if they pass full X.509 attestation and are not softbanned).
   - Users or API clients can report a key via `POST /api/report` (IP-rate limited to 1 report per IP per key per 24 hours).
   - **Threshold**: When `report_device_count > 5`, the key's status is automatically changed from `'strong'` to `'device'`.

7. **3rd-Party Auto-Looter (Every 1 Hour)**:
   - Evaluates configured 3rd-party sources (Specter catalog, GitHub repositories, custom sources).
   - Normalizes various formats: raw XML, Base64, Hex -> Base64, Specter custom scrambled Base64 alphabet, and ZIP archives.
   - **"Loot both Strong & Device, Skip Duplicates & Revocations"**:
     - Loots both `strong` and `device` (including softbanned) keys into the database.
     - Strictly rejects invalid, corrupted, or Google-revoked keys (`overall === 'fail'` or CRL revocation hits).
     - Skips duplicate keys by leaf certificate serial number or certificate hash.
     - On download (`GET /api/download`), the system still strictly prioritizes Strong keys over Device keys.

8. **Official Keybox Watermarking**:
   - All exported or downloaded keyboxes (`GET /api/download`, `POST /api/repair`) **must include the official Keybox Hub watermark banner comments**:
     - Top comment: Aggregated and verified by `https://keybox.hzzmonet.io.vn`, keybox ID, status, device ID, and timestamp.
     - Bottom comment: `<!-- Tổng hợp bởi Keybox Hub (https://keybox.hzzmonet.io.vn) -->`.
   - Watermarks are placed cleanly as standard XML comments so they do not disrupt tinyxml2, BoringSSL, or C++ parsers used in Android modules.

9. **Keybox Repair & Normalization Engine**:
   - Community-sourced keyboxes often fail in Android modules (TrickyStore, Chiteroman, APatch, KernelSU) due to:
     - Missing newlines in base64 (RFC 7468 requires 64 chars/line).
     - Mismatched `<NumberOfCertificates>` counters.
     - Mangled certificate chains (e.g. leaf at index 1 or reversed order).
     - Missing Google Hardware Attestation Root certificate (only 2 certs in chain).
     - PKCS#8 private keys instead of SEC1 (`-----BEGIN EC PRIVATE KEY-----`) or PKCS#1 (`-----BEGIN RSA PRIVATE KEY-----`).
     - Uppercase/non-standard XML tags (`<Certificate format="PEM">` vs `"pem"`).
   - The engine automatically repairs, reorders, completes, and standardizes these files before saving or via `POST /api/repair`.

---

## 3. Project Architecture & File Directory

```
/home/opc/keybox/
├── AGENT.md                 # This documentation file for AI agents
├── agent.md                 # Symlink to AGENT.md
├── package.json             # ES module project configuration & dependencies
├── data/
│   └── keybox.db            # SQLite database file (WAL mode)
├── src/
│   ├── analyzer.js          # Core certificate parser & KeyBoxChecker validator
│   ├── cron.js              # 1-hour periodic cycle scheduler (CRL -> Recheck -> Loot -> Purge)
│   ├── db.js                # SQLite data access layer, watermark & migration logic
│   ├── repairer.js          # Keybox Repair & Normalization Engine (TrickyStore compatibility)
│   ├── server.js            # Express application, REST endpoints, upload & download logic
│   ├── source-fetcher.js    # 3rd-party source fetcher, normalizer & auto-looter
│   ├── trust-data.js        # Fallback offline Google attestation roots & CRL snapshot
│   └── trust-manager.js     # Live Google CRL & Root certificate updater & memory cache
└── public/
    ├── index.html           # Single-page dashboard HTML with data-i18n attributes
    ├── style.css            # Dark charcoal / mint dashboard with responsive layouts
    └── app.js               # Client application, i18n dictionary (VI/EN), toast manager
```

---

## 4. Key Modules & Implementation Details

### `src/analyzer.js`
- Ported from [tiann/KeyBoxChecker](https://github.com/tiann/KeyBoxChecker).
- Validates:
  - `<Keybox>` XML parsing (extracts DeviceID, algorithms, private keys, certificate chains).
  - Matches private keys with leaf certificates (RSA modulus check, EC public key derivation & SPKI comparison).
  - Validates full X.509 certificate chains up to trusted root authorities.
  - Matches root certificates against recognized Google Hardware Attestation Roots (RSA 2048, RSA 4096, EC P-256).
  - Cross-references certificate serial numbers against the Google Attestation CRL. Note: Google API returns CRL entries keyed by **64-bit decimal strings** (e.g. `"6681152659205225093"`), while certificates store serial numbers in hex. `analyzer.js` tests decimal strings, hex strings, and BigInt representations.

### `src/trust-manager.js`
- Queries Google Attestation endpoints:
  - CRL Status: `https://android.googleapis.com/attestation/status`
  - Attestation Roots: `https://android.googleapis.com/attestation/root`
- Caches trust data in memory with disk fallback snapshot to survive transient network issues.
- Supports forced live refresh via `refreshTrustData(true)`.

### `src/source-fetcher.js`
- Decodes scrambled alphabets used by community sources like Specter (`rawbin.dpejoh.com`):
  - Source alphabet: `1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe`
  - Destination alphabet: Standard Base64 `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`
- Normalizes incoming body text: Direct XML, Base64, Hex -> Base64, Specter scrambled Base64, and ZIP archives (via `AdmZip`).
- Configured community sources include:
  1. `Specter Catalog (KOW, Yuri, Xiaomi)`: `https://rawbin.dpejoh.com/catalog` (Specter API)
  2. `Yurikey (Yurii0307 Official)`: `https://raw.githubusercontent.com/Yurii0307/yurikey/main/key`
  3. `AlwaysStrong (@evokerr)`: `https://evoker.qzz.io/key`
  4. `TrickBox (GueRapii / Charlie)`: `https://raw.githubusercontent.com/GueRapii/randommodulesfiles/main/file.enc`
  5. `dare-devil-ex / keyboxxBot`: `https://raw.githubusercontent.com/dare-devil-ex/keyboxxBot/main/keybox.xml`
  6. `FREECAMK / Play-Integrity`: `https://raw.githubusercontent.com/FREECAMK/Keybox-Play-Integrity-/main/keybox.xml`
  7. `davidepalma.it`: `https://www.davidepalma.it/pib/keybox.xml`
- Runs `analyzeKeybox(xml, trustData)` and enforces strict Strong validation (`!analysis.isSoftbanned`) before inserting into the database via `addKeyboxSkipDuplicate`. Duplicate leaf serials or certificate hashes are skipped automatically.

### `src/repairer.js`
- **Purpose**: Normalizes, repairs, and reconstructs broken community keybox files for 100% compatibility with Android modules (TrickyStore, Chiteroman, PlayIntegrityFork, APatch, KernelSU, Magisk).
- **Core Operations**:
  - Unpacks Base64, Hex, and Specter scrambled text; strips UTF-8 BOM, carriage returns (`\r\n` -> `\n`), and markdown code block wrappers.
  - Matches private keys to their leaf certificates by comparing SPKI DER bytes.
  - Chains certificates using `issuerDer === subjectDer` and cryptographically verifies signatures using WebCrypto `verifyCertificateSignature`.
  - Appends missing Google Hardware Attestation Root CA (`GOOGLE_ROOT_RSA_PEM` or `GOOGLE_ROOT_EC_PEM`) if the chain only has leaf + intermediate.
  - Re-encodes private keys to SEC1 for ECDSA (`-----BEGIN EC PRIVATE KEY-----`) and PKCS#1 for RSA (`-----BEGIN RSA PRIVATE KEY-----`).
  - Enforces strict 64-character line wrapping on all PEM blocks (RFC 7468 standard).
  - Normalizes XML casing: `<Key algorithm="ecdsa">`, `<PrivateKey format="pem">`, `<Certificate format="pem">`.
  - Fixes `<NumberOfCertificates>` to match actual cert count.
  - Injects clean Keybox Hub watermark banner comments.
  - Re-verifies the repaired XML against `analyzeKeybox` to confirm validity.

### `src/cron.js`
- Recurring 1-hour timer (`setInterval(..., 60 * 60 * 1000)`):
  1. `trustManager.refreshTrustData(true)`
  2. `recheckAllKeysInDb(trustData)`
  3. `fetchAndLootThirdPartySources(trustData)`
  4. `cleanupOldBannedKeys()`

---

## 5. Database Schema (`data/keybox.db`)

### Table: `keyboxes`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique record ID |
| `key_hash` | TEXT UNIQUE NOT NULL | SHA-256 hash of certificate serials + leaf keys |
| `device_id` | TEXT NOT NULL | Device ID extracted from XML attribute |
| `xml_content` | TEXT NOT NULL | Full raw `<AndroidAttestation>` XML |
| `algorithm` | TEXT NOT NULL | Algorithms detected (e.g. `ecdsa, rsa`) |
| `status` | TEXT NOT NULL | `'strong'`, `'device'`, or `'banned'` |
| `check_result` | TEXT NOT NULL | JSON string of analyzer output (warnings, errors) |
| `report_device_count` | INTEGER DEFAULT 0 | Count of device downgrade reports |
| `uploaded_at` | TEXT NOT NULL | ISO-8601 upload timestamp |
| `last_checked_at` | TEXT NOT NULL | ISO-8601 last attestation check timestamp |
| `banned_at` | TEXT | ISO-8601 timestamp when key failed/was revoked |
| `source` | TEXT DEFAULT 'user_upload' | Source identifier (e.g. `'Specter:KOW/7'`, `'user_upload'`) |
| `created_ip` | TEXT | IP address of uploader |
| `serials` | TEXT | JSON array of all leaf certificate serial variants (hex, unpadded, decimal) |
| `is_softbanned` | INTEGER DEFAULT 0 | 1 = flagged as softbanned by Specter catalog, 0 = normal |

### Table: `reports`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Record ID |
| `key_id` | INTEGER NOT NULL | References `keyboxes(id)` ON DELETE CASCADE |
| `reporter_ip` | TEXT NOT NULL | IP of client submitting the report |
| `created_at` | TEXT NOT NULL | ISO-8601 timestamp |

### Table: `sources`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Record ID |
| `name` | TEXT NOT NULL | Human-readable source name |
| `type` | TEXT NOT NULL | `'specter'` or `'raw_url'` |
| `url` | TEXT UNIQUE NOT NULL | HTTP URL of the source or catalog |
| `enabled` | INTEGER DEFAULT 1 | 1 = enabled for 1h looter, 0 = disabled |
| `last_fetched_at` | TEXT | ISO-8601 last fetch timestamp |
| `last_status` | TEXT | Status summary (e.g. `'OK (Found 2 candidate(s))'`) |

### Table: `meta`
| Column | Type | Description |
|---|---|---|
| `key` | TEXT PRIMARY KEY | Metadata key (`last_updated`, `last_looted_at`) |
| `value` | TEXT NOT NULL | Metadata value |

---

## 6. REST API Reference

All routes are served on `https://keybox.hzzmonet.io.vn/api/...`:

### 1. `GET /api/status`
Returns high-level system status and counts.
- **Response**:
  ```json
  {
    "status": "strong",
    "total_valid": 4,
    "strong_count": 4,
    "device_count": 0,
    "banned_count": 1,
    "total_keys": 5,
    "last_updated": "2026-09-09T11:06:37.845Z",
    "last_looted_at": "2026-09-09T11:06:37.845Z"
  }
  ```

### 2. `GET /api/download`
Downloads a random valid keybox. Priority: `strong` -> `device`.
- **Query Parameters**:
  - `?format=json`: Returns JSON payload `{ id, status, deviceId, algorithm, xml }`.
  - `?id=<number>`: Downloads a specific keybox by ID.
  - Omitted: Streams raw `keybox.xml` with `Content-Type: application/xml`.

### 3. `POST /api/upload`
Uploads and validates keyboxes. Automatically skips duplicates.
- **Payload formats**:
  - `multipart/form-data`: Single file or multiple files under field `file` or `files` (supports `.xml` or `.zip`).
  - `application/json`: `{ "url": "https://..." }` to fetch and import from a direct link.
  - `application/json`: `{ "xml": "<AndroidAttestation>..." }`.
  - `text/xml`: Raw XML text in body.
- **Response (Batch / Single)**:
  ```json
  {
    "success": true,
    "skipped": false,
    "id": 15,
    "status": "strong",
    "deviceId": "ASUS-56aa7acc-393b-4ceb-ac68-62da28c458d3",
    "algorithm": "ecdsa, rsa",
    "message": "Keybox hợp lệ và đã được thêm vào hệ thống!"
  }
  ```

### 4. `POST /api/loot`
Triggers an immediate 3rd-party source fetch and loot cycle.
- **Response**:
  ```json
  {
    "success": true,
    "lootResult": {
      "sources_checked": 3,
      "looted_count": 1,
      "skipped_duplicate_count": 2,
      "rejected_non_strong_count": 2,
      "details": [...]
    }
  }
  ```

### 5. `GET /api/sources`
Lists all configured 3rd-party keybox sources.

### 6. `POST /api/sources`
Adds a new custom source: `{ "name": "Custom Repo", "type": "raw_url", "url": "https://..." }`.

### 7. `POST /api/report`
Reports a key as degraded to Device integrity: `{ "id": 15 }`.

### 8. `POST /api/check-now`
Triggers a full database re-check with Google attestation servers and auto-loots 3rd-party sources.

### 9. `POST /api/repair`
Repairs corrupted, non-standard, or modified keyboxes into canonical XML compatible with all Android modules (TrickyStore, PIF, KernelSU, APatch).
- **Parameters**:
  - `file`: Multipart file upload (`.xml`, `.txt`, `.zip`).
  - Raw body: Direct XML string, loose PEM string, or JSON payload `{ "xml": "..." }`.
  - Query parameter `?download=true` or `?format=xml`: Streams back `keybox_repaired.xml` attachment.
- **Response (JSON default)**:
  ```json
  {
    "success": true,
    "deviceId": "ASUS-56aa7acc-393b-4ceb-ac68-62da28c458d3",
    "fixesApplied": [
      "Normalized Windows CRLF line endings to UNIX LF",
      "Reordered certificate chain: Moved leaf certificate from index 1 to index 0",
      "Appended missing Google Hardware Attestation RSA Root Certificate to complete trust chain",
      "Corrected <NumberOfCertificates> from 99 to 3",
      "Formatted XML with canonical 4-space indentation and TrickyStore tags"
    ],
    "repairedXml": "<?xml version=\"1.0\"?>...",
    "analysis": {
      "overall": "pass",
      "isSoftbanned": false,
      "warnings": [],
      "errors": []
    }
  }
  ```

---

## 7. Operations & Maintenance

### Systemd Service
```bash
# Check status
sudo systemctl status keybox.service

# Restart service (after code edits)
sudo systemctl restart keybox.service

# View live application logs
sudo journalctl -u keybox.service -f -n 50
```

### Caddy Reverse Proxy
Caddy config is located at `/etc/caddy/Caddyfile`:
```caddyfile
keybox.hzzmonet.io.vn {
    reverse_proxy 127.0.0.1:8098
}
```
Reload Caddy if modifying proxy rules:
```bash
sudo systemctl reload caddy
```

### Database Inspection & Direct Query
```bash
node -e '
import Database from "better-sqlite3";
const db = new Database("data/keybox.db");
console.log("Keyboxes:", db.prepare("SELECT id, device_id, status, source, uploaded_at FROM keyboxes").all());
'
```

---

## 8. Frontend & i18n Architecture

- **Path**: `public/index.html`, `public/style.css`, `public/app.js`
- **Cache-Busting**: `server.js` sets `Cache-Control: no-cache, no-store, must-revalidate` for `.html`, `.js`, and `.css` files. HTML `<script>` and `<link>` tags use version queries (currently `app.js?v=5.0` and `style.css?v=5.0`). Static asset edits are served immediately without restarting the service.
- **Dashboard Layout**: Sticky section navigation, allocation status banner, four summary metrics, download/upload panels, searchable repository with filtered/total counts, community sources, and API examples. The interface uses charcoal surfaces and mint accents; status colors distinguish Strong, Device, revoked, and connection errors.
- **Data Loading**: Status, keys, and sources load on first visit and refresh every 30 seconds. This UI refresh is separate from the hourly server validation/loot cycle.
- **Accessibility**: Upload tabs support arrow keys and Home/End, the file drop zone supports Enter/Space, inputs have translated accessible labels, and notifications announce updates. Keyboard focus styles, a skip link, horizontally scrollable table regions, and reduced-motion support are included. Download and copy controls are disabled when no valid keys are available.
- **Bilingual System (VI / EN)**:
  - Elements in HTML carry `data-i18n="key"`.
  - `translations` dictionary lives in `public/app.js`.
  - `applyLanguage('vi' | 'en')` dynamically updates DOM text, button labels, input placeholders, and toast notifications without requiring a page reload.
  - Active language is persisted in browser `localStorage.getItem("keybox_lang")`.
- **Responsive Media Queries**:
  - Four metric columns on desktop become two on smaller screens; download/upload panels stack below 800px. Wide tables scroll within their own containers.
  - Browser checks cover 320px, 390px, 768px, 1024px, and 1440px in both Vietnamese and English.
