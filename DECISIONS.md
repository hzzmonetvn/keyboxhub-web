# Architectural Decisions (DECISIONS.md)

## 1. RKP Qualification Criteria
- **Chosen**: A keybox is qualified as RKP (`is_rkp = 1`) if and only if it contains an EC/ECDSA key and certificate, and terminates at Google's Hardware Attestation EC Root (`google_p384_2026` / `Key Attestation CA1`).
- **Considered & Rejected**:
  - *Qualifying any EC certificate as RKP*: Rejected because legacy or non-attestation self-signed/test EC keys are not Remote Key Provisioned keys trusted by Google's hardware attestation.
  - *Requiring RSA + EC dual-key for RKP*: Rejected because pure RKP keyboxes often only contain modern ECDSA keys.

## 2. Keybox Quality Scoring Algorithm
- **Chosen**:
  - Base pass: +500, warn: +200, softban: -300 bonus exclusion.
  - RKP verification: +1000 points.
  - Full certificate chain completeness: +150 per recognized trusted root, +50 per certificate up to 400 max.
  - Dual-key (EC + RSA) presence: +200 bonus.
  - Chain signature validity: +100 bonus.
- **Considered & Rejected**:
  - *Comparing only certificate count*: Rejected because a malformed or low-grade RSA chain with 4 intermediate certs shouldn't beat an authentic 3-cert RKP chain.

## 3. Duplicate Serial Handling & Deduplication
- **Chosen**: In-place upgrade in SQLite (`UPDATE keyboxes SET xml_content = ?, check_result = ?, algorithm = ?, is_rkp = ? WHERE id = ?`). Preserves the primary key `id`, user feedback/report counter, and timestamps, preventing link breakage while upgrading the stored payload.
- **Considered & Rejected**:
  - *Deleting and inserting a new row*: Rejected because it increments the auto-increment ID and wipes out user reports and tracking history.
  - *Skip-only (previous behavior)*: Rejected because crawler discovery of full/better chains for existing keys was being dropped.

## 4. Download Priority Hierarchy (`/api/download`)
- **Chosen**: 4-Tier Selection Hierarchy:
  - Tier 1: `status = 'strong'` AND `is_rkp = 1`
  - Tier 2: `status = 'strong'` (standard keys)
  - Tier 3: `status = 'device'` AND `is_rkp = 1`
  - Tier 4: `status = 'device'` (standard keys)
  Within the active tier, items are sorted by quality score descending, and a random pick is made among the top-scoring keys for load balancing.
- **Considered & Rejected**:
  - *Single SQL query with ORDER BY quality_score DESC LIMIT 1*: Rejected because it would repeatedly serve the single same keybox to all users, causing faster Google rate limiting/blacklisting of that single key.

## 5. Mobile Responsiveness Improvements
- **Chosen**:
  - Added CSS touch-scrolling horizontally (`overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none;`) on `.nav-links` so the navigation bar does not overflow the viewport on small mobile devices.
  - Removed rigid `min-width: 740px` and `max-width: 240px` caps that caused horizontal page stretching and text collisions on mobile viewports.
  - Added `.badge-rkp` styling and optimized `.table-actions` buttons to fit comfortably within mobile widths.
- **Considered & Rejected**:
  - *Hiding columns on mobile*: Rejected because users need to see status, algorithm, and action buttons directly.

## 6. Report Device Security & Threshold
- **Chosen**:
  - **Single Report Threshold (`>= 1`)**: 1 report immediately marks a keybox as degraded to `device` integrity.
  - **Shared Token Authentication**: Secures `/api/report` by requiring a valid subscriber access token (using the exact same token hash mechanism as webhook/Telegram subscribers via `getNotificationSubscriber` or admin session).
  - **Removed Public UI Report Button**: Stripped the "Báo Device" button from the public web repository table in `public/app.js` and `public/index.html`. Public unauthenticated users cannot tamper with key status.
- **Considered & Rejected**:
  - *Keeping the UI button with a captcha*: Rejected because public users should not demote keys arbitrarily, and API reporting is intended for authorized client systems / automated testers.
  - *Separate token table for reports*: Rejected in favor of unifying with subscriber tokens (`notification-settings.json`), keeping token management streamlined.

## 7. Extended Keybox Metadata in `/api/status`
- **Chosen**:
  - Added a `keyboxes` array to `/api/status` containing all active (`strong` and `device`) keyboxes ordered by RKP tier and status.
  - Each keybox item provides: `id`, `name` (sanitized `device_id` or `Keybox #{id} ({source})`), `device_id`, `status`, `download_url` (full URL pointing directly to `/api/download?id={id}`), `source`, `uploaded_at`, `is_rkp`, `certificate_count`, `algorithms` (array of algorithm strings), and `certificate_details` (per-key algorithm and certificate counts).
  - Preserved all existing root fields (`status`, `total_valid`, `strong_count`, `device_count`, `banned_count`, `softbanned_count`, `total_keys`, `last_updated`, `last_looted_at`) to guarantee 100% backward compatibility with legacy Kaorios Toolbox versions.
- **Considered & Rejected**:
  - *Replacing `/api/status` with an array*: Rejected because legacy app versions parse root fields and would throw JSONException.
  - *Including banned keyboxes*: Rejected because consumers of status selection only select valid and downloadable keyboxes.
  - *Relative download URLs*: Rejected in favor of full absolute URLs (`https://keybox.hzzmonet.io.vn/api/download?id={id}`) to allow direct downloading or simple extraction.

## 8. Fallback Telegram Bot Architecture
- **Chosen**:
  - Native zero-dependency Telegram bot module (`src/telegram-bot.js`) utilizing Node.js 22 built-in `fetch`, `FormData`, and `Blob`.
  - Outbound long polling (`getUpdates`) by default with initial stale update dropping (`deleteWebhook({ drop_pending_updates: true })`) so the bot functions reliably during web domain outages without requiring incoming HTTPS traffic.
  - Token resolution hierarchy: `process.env.TELEGRAM_BOT_TOKEN` -> first configured subscriber bot token in `data/notification-settings.json`.
  - Command set:
    - `/status`: Real-time system health, strong/device/softban/banned counts, and last attestation timestamp.
    - `/list`: Overview of all active keyboxes with ID, status, RKP/HW tag, sanitized device identifier, and quick-download syntax.
    - `/keybox [none/rkp/hw/device/{id}]`: Direct delivery of watermarked `keybox.xml` document attachments with structured captions.
    - `/start`, `/help`: Interactive usage guide.
  - Group chat compatibility: Strips `@botname` command suffixes and suppresses unknown command warnings in group chats to eliminate noise.
  - Webhook endpoint (`POST /api/telegram/webhook`) exposed on Express for future hybrid or webhook-driven routing once the domain is restored.
- **Considered & Rejected**:
  - *Third-party bot frameworks (`telegraf`, `node-telegram-bot-api`)*: Rejected to keep the codebase minimal, dependency-free, and resilient against supply chain drift.
  - *Webhook-only mode*: Rejected because the current web domain is down; Telegram webhooks fail without valid public HTTPS certificates.
  - *Plain text XML distribution*: Rejected because mobile Android root tools (KernelSU, Magisk, TrickyStore) require importing `.xml` files directly. Document uploads provide a one-tap import experience.

## 9. Google AdSense Integration
- **Chosen**:
  - Embedded Google AdSense client script (`ca-pub-7263466911273897`) in `<head>` of both the root domain `hzzmonet.io.vn` (`/var/www/hanami/index.html` via `bio`) and subdomain `keybox.hzzmonet.io.vn` (`public/index.html`) with `async` and `crossorigin="anonymous"`.
  - Complies with Google AdSense requirement where new sites must be verified at the top-level root domain (`hzzmonet.io.vn`) before subdomains can be activated.
- **Considered & Rejected**:
  - *Embedding only on subdomain `keybox.hzzmonet.io.vn`*: Rejected because Google AdSense site addition requires verifying the root domain (`hzzmonet.io.vn`) first; crawlers reject verification if the snippet is absent from the root domain.
  - *Placing at end of `<body>`*: Rejected because Google AdSense site verification crawler specifically requires the tag to reside within `<head> ... </head>`.
  - *Dynamically injecting via JavaScript*: Rejected to ensure the verification scraper detects the snippet in static HTML parsing passes.

## 10. Modern Developer Tool Bento Grid UI Architecture
- **Chosen**:
  - Full redesign inspired by Linear and Vercel: Deep obsidian palette (`#080b0e`, `#0d1217`, `#131920`), subtle crisp 1px borders (`rgba(255, 255, 255, 0.07)`), and emerald/cyan glowing accents (`--primary: #10b981`, `--rkp-cyan: #06b6d4`).
  - Bento Grid layout: Modular CSS Grid with auto-fit minmax responsive sizing, separating Hero Status Engine, 4 Metric Tiles (Strong Tier 1, Device Tier 2, Revoked Purged, Total Inventory), Quick Operations (Profile Download & Upload Studio), Detailed Inspection Panel, Repository Table, Keybox Repair Studio, Community Sources, Notifications Hub, and API Reference.
  - Dark Mode Only: Exclusively engineered for high-performance developer dark environments with maximum visual contrast and zero glare.
  - Sub-tabs and micro-interactions: Clean pill filters with keyboard navigation (`ArrowLeft`/`ArrowRight`, `Home`, `End`), drag-and-drop zone with animated dashes, and instant clipboard feedback.
- **Considered & Rejected**:
  - *Light mode toggle / dual theme*: Rejected per user preference for an exclusive, highly refined developer dark theme that matches modern terminal & devtool aesthetics.
  - *Accordion or single vertical scroll stack*: Rejected because a single vertical list requires extensive scrolling and obscures system status and metrics on wider displays. Bento Grid provides high information density with immediate clarity.

## 11. Profile-Specific Keybox Provisioning (`/api/download?profile=...`)
- **Chosen**:
  - Extended `/api/download` with `profile=rkp` (Remote Key Provisioning, ECDSA P-256) and `profile=hw` (OEM Hardware keys with dual EC + RSA support), alongside existing quality-prioritized general downloads.
  - Extended `/api/status` to return `total_rkp_valid` and `total_hw_valid`, and added `profile: "rkp" | "hw"` to all items in `keyboxes`.
  - Added dedicated UI download cards for both profiles in the Quick Operations Bento with direct cURL copy commands and download links.
  - Added client-side state handling to disable profile download buttons when no valid keys are present in that profile.
- **Considered & Rejected**:
  - *Separate endpoints `/api/download/rkp` and `/api/download/hw`*: Rejected in favor of query parameter `?profile=...` on the standard `/api/download` endpoint to maintain a unified URL structure compatible with existing clients.
  - *Serving hardware keys when RKP is explicitly requested*: Rejected because clients requesting RKP require Google's EC P-384 root chain specifically; returning an OEM RSA key when RKP was asked would fail client expectations.

## 12. Canonical Keybox XML Synchronization & AOSP KeyBoxManager Compatibility
- **Chosen**:
  - Enforce the official AOSP / Kaorios `KeyBoxManager.java` XML specification across the entire lifecycle (parsing, repairing, storing, and exporting/downloading):
    1. Every `<Key>` node strictly wraps all certificates in `<CertificateChain>` with an explicit `<NumberOfCertificates>` child tag matching the true certificate count.
    2. Any conjoined certificates (multiple PEM blocks concatenated inside a single `<Certificate>` tag) are automatically parsed and separated into individual `<Certificate format="pem">` tags.
    3. Dedicated canonicalizer function `formatCanonicalKeyboxXml` handles XML standardization with clean 4-space indentation and RFC 64-char line-wrapped PEM blocks.
    4. Automatic startup migration in `initDb()` canonicalizes any legacy records in `keyboxes.db`.
    5. Storage (`addKeyboxSkipDuplicate`) and export/download (`applyKeyboxWatermark`) strictly generate canonical XML.
- **Considered & Rejected**:
  - *Allowing raw/unwrapped `<Certificate>` tags without `<CertificateChain>`*: Rejected because AOSP `KeyBoxManager` uses a SAX/XML pull parser with an `inCertificateChain` boolean state flag; certificates outside `<CertificateChain>` are silently ignored, causing attestation initialization failures.
  - *Leaving concatenated PEMs in one `<Certificate>` tag*: Rejected because Java's `CertificateFactory.generateCertificate(InputStream)` parses only the first certificate from the stream unless iterated explicitly; Android KeyBoxManager stops after reading the first cert, losing the intermediate and root CA certificates.
  - *Formatting only at download time and keeping non-standard XML in DB*: Rejected because storing normalized canonical XML ensures database consistency, accurate certificate counting, and uniform hash generation.

## 13. Dark Premium Visual Refresh
- **Chosen**:
  - Visual-only refresh of the existing section order and grid layout; retain all element IDs, frontend handlers, API contracts, and existing language selection.
  - Ink blue canvas (`#101622`), slate surfaces (`#182131`, `#1e293c`), periwinkle action accent (`#acbaff`), muted cyan profile accents, and separate labeled success/warning/error states.
  - Be Vietnam Pro for readable Vietnamese interface text; retain JetBrains Mono for commands, XML, and identifiers. Inventory values use neutral text and tabular numerals rather than colored numbers.
  - Preserve the status panel as the visual focal point, with a stronger top border; keep surrounding surfaces quiet, without glowing effects or decorative gradients.
  - Wrap navigation at narrower widths, keep metrics in two columns on mobile, stack form controls and download profiles, and contain wide tables inside horizontal scroll regions without hiding columns.
  - Retain keyboard focus indicators, provide reduced-motion overrides, and bump the stylesheet query version to avoid stale cached styles.
- **Considered & Rejected**:
  - Sidebar navigation, reordered sections, or new interaction flows: rejected because the requested scope preserves the existing layout.
  - Light theme, translation changes, new dependencies, and backend modifications: outside the requested visual refresh.
  - Emerald glow styling: replaced with a quieter blue/periwinkle palette to distinguish the refresh from the previous theme.
- **Verification**:
  - Existing local server returned the new stylesheet byte-for-byte; `node --check public/app.js` passed.
  - Source review checked frontend class bindings and responsive rules; added matching danger-button and refresh-spinner styles.
  - Browser verification was attempted but blocked because the configured Chrome binary is absent. Visual appearance, real-device overflow, and browser interaction checks remain unverified.

## 14. Central Administration, Shared Notifications and Expressive Appearance
- **Chosen**:
  - Dedicated `/admin` interface reuses the existing administrator password and expiring bearer session. Session credentials remain in page memory, not browser storage; logout clears sensitive form and token contents.
  - Administrators manage shared Webhook/Telegram settings, keybox deletion, source CRUD, independent recheck/source/browser refresh intervals, and per-IP limits for downloads, uploads/repair, operations, login and reports.
  - Legacy subscriber records remain for API authorization, but individual delivery is disabled. Shared delivery starts disabled rather than borrowing a user's existing bot/chat credentials. Saving settings does not send a test message; no test-send control is exposed.
  - Media is configured with direct HTTPS URLs, independently for desktop and mobile, with separate video poster URLs. Background video is muted; reduced-motion visitors use its poster or a solid fallback. Administration never previews remote media or plays music.
  - Music starts only after visitor interaction; preference is a per-device convenience stored defensively in browser storage. Browser autoplay restrictions and unavailable media leave a usable manual control.
  - Material 3 Expressive-inspired tonal surfaces, pill controls and varied rounded geometry retain the public section order. Administrators select light/dark content, accent color, card opacity and background dimming.
  - Bright-background browser checks initially motivated a 90% opacity floor; section 15 supersedes that floor at the user's request. Primary action ink is chosen from black/white using relative luminance. Accent colors do not replace normal text ink.
- **Considered & Rejected**:
  - Upload storage and new account/password systems: rejected in favor of URL-only media and existing administrator authentication, as requested.
  - Keeping subscriber notification delivery alongside shared delivery: rejected to avoid duplicate or unwanted group messages. Existing secrets are retained, not migrated into a shared destination.
  - Automatic music with sound and uncontrolled transparency: rejected because autoplay is restricted and variable image/video brightness can make text unreadable.
  - Public source mutation and expensive scan controls: moved to authenticated administration rather than leaving public controls that cannot perform their actions.
- **Operational assumptions**:
  - Limits apply to shared IPs collectively and are process-local; restarting resets counters. Only the local reverse proxy is trusted for client-IP forwarding.
  - Defaults are 60 downloads, 10 uploads/repairs, 3 scans/checks, 5 login attempts and 10 reports per IP per minute; they can be adjusted in administration. Server recheck and source schedules default to 60 minutes; browser data refresh defaults to 60 seconds.
  - The running service is not restarted during development. Backend activation requires a deliberate deployment/restart after verification; no existing notification destination is exercised by verification.
- **Verification**:
  - Full isolated suite: 54 tests passed, zero failed. Coverage includes settings validation, administrator authorization/CRUD, shared notification redaction and disabled legacy delivery, per-IP limit isolation, Retry-After, expiry and capacity.
  - Isolated Chromium checks passed at widths 320, 375, 768 and 1440: no page overflow, public tabs/language, admin login/settings persistence across tabs, key deletion, source creation, notification save, token issuance and logout cleanup.
  - Media checks used intercepted local fixtures: desktop image/mobile poster selection, reduced motion, unavailable audio, light/dark content over white backgrounds. No production Webhook or Telegram test messages were sent.
  - Browser API responses were mocked; backend behavior was exercised separately by the isolated test suite. Real Android/iOS playback and production reverse-proxy integration remain deployment checks.

## 15. Full Appearance Effect Ranges (2026-10-30)
- **Chosen**: Allow card opacity and background dimming from 0 to 1, and add card backdrop blur from 0 to 100px. Remove the CSS opacity floor, including on the hero card. Preserve saved values; legacy settings without blur use the previous 24px default.
- **Considered & Rejected**: Retaining the 90% opacity floor was rejected following explicit approval of full transparency and its readability tradeoff. Unbounded blur was rejected in favor of the agreed 100px maximum; rate limits and other security constraints are unchanged.
- **Verification**: Focused settings test passed, including saving/reloading both extremes, legacy blur fallback, and rejection outside the agreed ranges. Frontend syntax and diff whitespace checks passed. No live settings or notification destinations were changed; this update needs a backend restart.
- **Nested surface follow-up**: Apply the shared opacity to navigation, nested download/upload panels, form fields, code blocks, table headers/hover rows, filters, secondary controls and floating feedback. Keep primary actions and status colors distinct rather than fading text with element-level opacity. Chromium computed-style checks passed for eight representative surfaces at 0%, 50% and 100% opacity in both light and dark themes. Stylesheet cache version updated; no backend restart needed for this CSS follow-up.

## 16. Repository Release and Public Contributions (2026-10-30)
- **Chosen**: Publish the current source changes on a feature branch, with sanitized desktop/mobile README previews. Move the existing background into `public/images/bg.jpg`; accept local `/images/` media paths and switch the server's background configuration without changing other settings.
- **Data boundary**: Untrack SQLite/WAL and trust cache while preserving server files. Ignore runtime site/notification settings and local architecture notes; never stage credentials. Existing tracked dependencies remain unchanged to avoid unrelated repository churn. Old database snapshots remain in Git history; no history rewrite was authorized.
- **Public sources**: Supersedes the source-add restriction in section 14: anonymous visitors may add validated HTTPS sources, rate-limited per IP without immediate fetching. Editing/deleting/scanning remains administrator-only.
- **Mobile**: Reduce vertical gaps, profile-card stretching, upload-zone padding and footer spacing while retaining touch target sizes and table scrolling.
- **Rejected**: Shipping live database/configuration files, reusing live data for previews, or triggering a scan during anonymous submission. Previews use illustrative API fixtures with outbound requests blocked.
- **Clean startup fix**: Removing tracked runtime data exposed the database path being captured before test isolation and missing `data/` on fresh setups. Resolve/create the data directory inside `initDb`; retain runtime files on the server.
- **Verification**: Full suite passed 54/54 from a new external temporary working directory after fixing clean database startup. Earlier attempts failed on missing data directory and a corrected local path variable. Sanitized Chromium previews passed at 375px and 1440px with no horizontal page overflow; source syntax, diff checks and credential scans passed. No real test notifications sent.

## 17. GitHub Links and Ad Integration (2026-10-31)
- **Chosen**:
  - Add repository links to `https://github.com/hzzmonetvn/keyboxhub-web` in both the main header navigation actions (`.nav-actions`) and the footer (`.footer-content`).
  - Use responsive text display with `.btn-label` to collapse link text to an icon button on narrow mobile screens while preserving minimum touch target dimensions (36x40px).
  - Add Monetag service worker `public/sw.js` and loader script `public/ads.js` for ad zone integration, keeping them strictly excluded from git tracking in `.gitignore`.
- **Considered & Rejected**:
  - Placing GitHub link in the scrollable tab navigation bar: rejected to keep core operational navigation clear.
  - Committing ad scripts and service workers to source control: rejected to keep repository clean and avoid shipping third-party network scripts into the open-source repository.
- **Verification**:
  - Full test suite passed (54/54).
  - Verified local server response on port 8098 for navbar and footer links.
  - Changes pushed to `origin/main`.

## 18. Standardized Community Keybox Sources and Database Sanitization (2026-10-31)
- **Chosen**:
  - Standardize default 3rd-party community sources to include active verified endpoints: Specter Catalog, Yurikey (Yurii0307), AlwaysStrong (@evokerr), Evolution X, ZKOS Database (zuri1503), dare-devil-ex, TrickBox (GueRapii), GreyElaina, and mywoopies/mejson.
  - In `initDb()`, use `INSERT OR IGNORE` to incrementally seed any missing default sources across updates without overwriting existing administrator modifications.
  - Automatically disable known defunct sources returning HTTP 404/502 (FREECAMK, AnhTran1006, davidepalma, corsfix proxy, plain HTTP AlwaysStrong) and purge dummy test URLs (`example.test/community`) to eliminate noise and wasted timeouts in periodic cron loot cycles.
  - Safely synchronize the persistent `data/keybox.db` database file before service restart to ensure zero key loss and smooth process handover.
- **Considered & Rejected**:
  - Resetting or truncating the database sources table: rejected to preserve any user-added community sources and operational metadata.
  - Leaving defunct 404/502 endpoints enabled: rejected to prevent periodic looter cycles from spamming error logs.
- **Verification**:
  - Full test suite passed (54/54).
  - Service restarted (`systemctl restart keybox`); verified clean looter cycle completing in 7 seconds with zero 404/502 errors and 2 active valid keyboxes intact.

## 19. PC Video Background and Audio Separation (2026-10-31)
- **Chosen**:
  - Download high-definition video from X (tweet 2116367064436998250).
  - Split into a muted progressive H.264 MP4 video (`public/media/bg.mp4`), a 192kbps stereo MP3 audio track (`public/media/bg.mp3`), and a video poster frame (`public/media/bg-poster.jpg`).
  - Extend `mediaUrl()` validation in `src/site-settings.js` and `public/admin.js` to allow `/media/` paths in addition to `/images/` with path-traversal prevention.
  - Update `public/admin.html` input types from `type="url"` to `type="text"` to allow submitting repo-relative media paths without browser validation conflicts.
  - Configure desktop interface in `data/site-settings.json` to use `desktop_url: "/media/bg.mp4"`, `desktop_type: "video"`, `desktop_poster: "/media/bg-poster.jpg"`, and `music_url: "/media/bg.mp3"`.
- **Considered & Rejected**:
  - Keeping audio inside the background video file: rejected because modern browsers block or throttle autoplay for video elements with audio tracks. Stripping audio allows flawless muted background video autoplay while preserving audio for user-controlled background music.
  - Relying on external CDN/streaming URLs: rejected in favor of self-hosting the media assets directly inside `public/media/` for zero third-party latency, offline resilience, and guaranteed byte-range support.
- **Verification**:
  - Test suite passed 54/54 tests, including new unit test assertions for `/media/` path validation and directory traversal prevention.
  - Service restarted (`systemctl restart keybox.service`); verified HTTP 200 OK, `video/mp4`, `audio/mpeg`, and `image/jpeg` byte-range headers on port 8098.

## 20. AdBlock Detection and Polite Skip Modal (2026-10-31)
- **Chosen**:
  - Implement dual-layer AdBlock detection combining a standard DOM bait element (`.adsbox`, `.pub_300x250`, etc.) and a non-cors network probe to detect both cosmetic element blocking and network request filters.
  - Delay detection by 1.5 seconds after page load to prevent blocking initial rendering and ensure accurate filter evaluation.
  - Present a theme-aware glassmorphic modal inspired by the MiFirm design with a polite apology, emoji, and explanation that ad revenue sustains the free server.
  - Provide two straightforward actions:
    - Primary button ("Đã hiểu, tôi đã tắt" / "Understood, I turned it off") to reload the page when the user disables their blocker.
    - Dismissive text button ("Bỏ qua, tôi không muốn giúp" / "I do not want to help") saving dismissal state in `sessionStorage` so users can proceed unhindered without being nagged again during the session.
  - Integrate dynamic bilingual translations (Vietnamese and English) syncing automatically with the site language switch.
- **Considered & Rejected**:
  - Persistent localStorage cooldown or hard wall blocking keybox downloads: rejected in accordance with user choice to always allow skipping without degrading keybox lookup or download capabilities.
  - Third-party bloated adblock detection libraries: rejected in favor of lightweight (~40 lines) zero-dependency vanilla JS directly inside `public/app.js`.
- **Verification**:
  - Full test suite passed (54/54).
  - Validated syntax with `node --check public/app.js`.
  - Service restarted and static assets verified.

## 21. Revert PC Background to Static Image (2026-10-31)
- **Chosen**:
  - Revert PC desktop background to the previous high-quality static image `/images/bg.jpg` (`desktop_type: "image"`).
  - Clear `music_url` and remove the unused 2.3MB media files (`public/media/bg.mp4`, `public/media/bg.mp3`, `public/media/bg-poster.jpg`) to keep the repository lean.
  - Maintain the generic `/media/` URL validation support in `src/site-settings.js` and `public/admin.js` for future media usage.
- **Verification**:
  - Full test suite passed (54/54).
  - Re-verified `/api/site-settings` and static image asset delivery HTTP 200 OK on port 8098.

## 22. Unslop Interface Overhaul (2026-11-01)
- **Chosen**:
  - Execute a comprehensive 9-pass design unslopping across `public/style.css`, `public/app.js`, and `public/index.html`.
  - **Spacing**: Snap all paddings, margins, gaps, and heights to a strict 4px grid. Normalize header height from an oversized 84px to a compact 60px app bar. Container padding set to 24px desktop and 16px mobile.
  - **Color**: Eliminate hardcoded hex values (`#202d47`, `#43577e`, `#151e2e`, `#1f2b3f`, `#586985`, `#101622f5`). Introduce a unified Ink neutral dark ramp (`#0b0d14` canvas, `#11141c` surface, `#1a1e28` elevated, `#222836` subtle) with quiet 8% hairline borders and a single focused accent.
  - **Icons**: Remove casual emojis (`😥`, `👍`, `😔`) from the AdBlock modal and replace them with crisp, standardized SVG line icons and a dedicated icon wrap badge.
  - **Copy**: Adopt calm, professional, technical phrasing. Remove trailing exclamation marks from status messages and toasts. Refactor AdBlock messaging from guilt-inducing phrasing to respectful developer-focused explanations.
  - **Typography**: Eliminate extreme weights (700/800) in favor of 400/500 with 600 reserved for primary headings. Remove sub-10px unreadable fonts and enforce tabular numbers for metric counters.
  - **Nested Radius Math**: Replace random 9999px pills and oversized 32px borders with mathematical nested radii (`R_inner = max(4px, R_outer - padding)`): 16px cards, 8px inputs/controls, and 6px tags/badges.
  - **Visuals & Motion**: Standardize easing to `cubic-bezier(0.22, 1, 0.36, 1)`, hovers to 150ms, and maintain strict reduced-motion safeguards.
- **Considered & Rejected**:
  - Retaining arbitrary border radii and heavy border-top colored accents: rejected to avoid visual noise and ensure consistency across dense data views.
  - Generic template re-skinning: rejected in favor of an exact technical hardware-security console aesthetic tailored to Android attestation and X.509 verification.
- **Verification**:
  - 54/54 automated tests passing.
  - Validated syntax with `node --check public/app.js`.
  - Service restarted (`systemctl restart keybox.service`) and verified live HTTP 200 responses on port 8098.





## 23. Banned Status and Recent System Log (2026-11-02)
- **Chosen**:
  - Label the revoked-count metric `BANNED`; keep RKP reserved for the key profile classification.
  - Create a SQLite `keybox_logs` event table and record only events from installation onward: accepted keys as `added`, transitions to `device`, and rejected/deleted revoked keys as `banned`. Store Device ID, one serial value (blank when unavailable), status, and event timestamp; expose only the newest 10 events across the whole installation at public `GET /api/logs`.
  - Write banned events before rejecting an upload or deleting a previously stored key, preserving its identifiers after the key row is purged.
- **Considered & Rejected**:
  - Reconstructing prior history from current key rows: rejected because purged keys have no durable source data and the requested history starts when this feature is installed.
  - Per-user logs or an unbounded audit table: rejected because the log is system-wide and must retain at most 10 entries.
  - Requiring admin authentication for the display: rejected because the main dashboard log is public-facing and holds only key metadata already exposed by the public key listing.

## 24. Comprehensive Design Unslopping Pass (2026-11-11)
- **Chosen**:
  - Full execution of the unslop methodology across `public/style.css`, `public/app.js`, and `public/index.html`.
  - **Grid & Dimensions**: Enforced strict 4px grid across all interactive controls and card layouts. Standardized control heights (`.studio-tab-btn`, `.input-styled`, `.search-input`, `.adblock-btn-confirm`) to 36px, with `.btn-micro` at 24px (replacing inline styles). Corrected `scroll-padding-top` to 112px.
  - **Hairline Neutral Borders**: Replaced high-contrast neon/colored borders on status badges and tags (`.badge-strong`, `.badge-device`, `.badge-banned`, `.badge-rkp`, `.status-badge.*`) with calm hairlines (`var(--border)`).
  - **Iconography Standardization**: Unified SVG stroke widths across the entire application interface to a consistent 1.8. Replaced colored icon wraps with neutral elevated surfaces (`var(--bg-surface-elevated)`).
  - **Typography Normalization**: Stripped heavy weights (700/800) from Google Fonts imports for Be Vietnam Pro and JetBrains Mono, enforcing typographic hierarchy through scale (12px, 14px, 16px, 18px, 26px) and color contrast rather than extreme bold weights.
  - **Sentence Case & Copy Calming**: Eliminated shouty all-caps tags (`TIER 1` → `Tier 1`, `FALLBACK` → `Fallback`, `BANNED` → `Banned`, `INVENTORY` → `Inventory`), removed `text-transform: uppercase` from `.section-eyebrow`, and stripped all exclamation marks (`!`) from user-facing toasts and notifications in both Vietnamese and English.
  - **Inline Style Extraction**: Eradicated all scattered inline `style="..."` attributes from `public/index.html` and extracted them into semantic CSS utility classes (`.action-footer-wrap`, `.flex-1`, `.m-0`, `.panel-analysis`, `.modal-header-row`, `.panel-title`, `.table-title-group`, `.table-title`, `.empty-cell`, `.repair-meta-info`, `.repair-device-id`, `.repair-meta-actions`, `.repair-fixes-wrap`, `.repair-fixes-title`, `.footer-github-link`).
  - **Asset Versioning**: Bumped asset cache query parameters to `v=8.7` for `style.css` and `app.js`.
- **Considered & Rejected**:
  - *Retaining bold font weights (700/800)*: Rejected because heavy bold weights distort Vietnamese diacritics and create typographic visual clutter in dense technical consoles.
  - *Keeping colored borders on status badges*: Rejected because colored borders draw excessive eye focus away from primary data content, violating the "single bright element / quiet chrome" principle.
- **Verification**:
  - 56/56 automated unit/integration tests passing.
  - Clean syntax checks with `node --check public/app.js`.
  - Service restarted (`systemctl restart keybox.service`) and verified live HTTP response.

## 25. Automatic & Toggle Dark/Light Mode with OS prefers-color-scheme (2026-11-11)
- **Chosen**:
  - Implement dynamic automatic dark/light mode synchronization matching visitor operating system preferences (`prefers-color-scheme: light/dark`) with live update listeners (`matchMedia.addEventListener('change')`).
  - Introduce a 3-state visitor theme control (`Auto` → `Light` → `Dark` → `Auto`) in the navigation bar (`#btn-theme-toggle`), persisted via `localStorage.keybox_theme`.
  - Provide an inline anti-FOUC initialization script in `<head>` of `public/index.html` to eliminate flash of wrong theme on first paint.
  - Native CSS fallback via `@media (prefers-color-scheme: light)` for `:root:not([data-theme="dark"])` in `public/style.css`.
  - Dynamic overlay adaptation (`--overlay-bg: #ffffff` in light mode, `#000000` in dark mode) ensuring background canvas images maintain high legibility under both modes.
  - Luminance contrast safeguard: dynamically adjusting `--primary` and `--border-focus` to accessible indigo (`#4f5be8`) in light mode if the administrator's custom accent was tuned for dark mode.
  - Standardized SVG icons (Monitor for Auto, Sun for Light, Moon for Dark) strictly conforming to `stroke-width="1.8"`.
  - Full bilingual i18n integration in Vietnamese and English for labels, tooltips, aria-labels, and toast feedback.
  - Bumped asset cache versions: `style.css?v=8.8`, `site-ui.js?v=1.2`, and `app.js?v=8.8`.
- **Considered & Rejected**:
  - *Binary Light/Dark toggle without Auto*: Rejected because users expect automated system-level synchronization by default.
  - *Forcing server settings over visitor choice*: Rejected because client accessibility and viewing conditions require user-level preference precedence, with server mode serving as the graceful default.
  - *Waiting for `/api/site-settings` before theme paint*: Rejected to avoid visual flickering (FOUC).
- **Verification**:
  - 56/56 automated unit/integration tests passing (`npm test`).
  - Syntax verified with `node --check public/app.js` and `node --check public/site-ui.js`.
  - Service restarted (`systemctl restart keybox.service`) and confirmed HTTP 200 response on port 8098.
