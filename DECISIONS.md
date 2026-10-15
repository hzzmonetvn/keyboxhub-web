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
