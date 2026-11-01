# Data mapping

- `scan-data-mapping.json`: Scan 4M (WCS Scan + Plus).
- `cvr-data-mapping.json`: CVR 4M (WCS Verify + Plus + Plus Error Log + Item Mapping).
- `scan-output-schema.json`: Scan 4M Excel output layout.
- `cvr-output-schema.json`: CVR 4M Excel output layout (currently 44 columns).

CVR exports read `sheetName` and `columns` from `cvr-output-schema.json`.
The array order is the Excel column order; keep `index` sequential from 0.
Each column defines its database `key`, displayed `header`, `width`, and optional
Excel number `format`. Identifier columns use `@` to preserve leading zeroes;
the three NG percentage columns use `0.000"%"` because values are already
percentage points. This schema controls Excel export, as with Scan; web table
headers remain defined in the frontend page.

For CVR, the CSV parser reads WCS column names from `mappings.*.sourceColumn`
and validates `wcsRequiredColumns`. If an upstream required header is renamed,
update both entries. Defect `sourceColumn` values such as `{processType}1` resolve
to actual header codes (`AEA1`, `ASA1`, `ASS1`, etc.). `storageColumn` specifies
the normalized database field (`d1` through `d10`). The Excel parser locates
these codes in the configured header row, including shifted Shadow groups at
DI:DR and EE:EN. `plusErrorImport.columns` uses Excel column letters; R/S are
the Display NG Qty / NG Rate(%) columns, distinct from Total Batch P/Q.
The matcher reads normalized defect columns for each side and `errorProcessTypes`
from this file, during both import and rematch.
Matching uses exact item + lot. Side A sums AEA/ASA/ASS; side B sums AEB/ASB/BSS,
without selecting groups by recipe or Item Mapping process. Similar lot prefixes
are not included. Total pattern NG = accumulative defects A + B. Total pcs =
Total sheet (Indi) × pcs/sheet from Item Mapping. Overall, A-side and B-side
NG percentages use that same denominator, multiply by 100 for display, and round
to six decimal places. A missing or zero denominator produces null percentages,
displayed as —. Display NG Qty/NG Rate and raw `wcsNgQty` are retained as source
data but do not determine the calculated CVR totals or percentages.
The other source descriptions and calculated rules document the existing matching
logic; calculation expressions are not evaluated from JSON.

Restart the backend after editing configuration. Existing imported data is not
rewritten by a config edit; changes apply when records are imported or rematched.
Files already marked as imported are skipped by the normal scanner.

## Runtime behavior

- `scanner.enabled` controls the initial/background scan; authorized manual scans remain available.
- `maxConcurrentFiles` bounds concurrent file stability/hash work. SQLite write transactions are serialized.
- `retryAttempts` counts additional attempts after IO/database failures, with `retryDelayMs` between attempts. FileProcessingError is not retried within the cycle.
- Each file import, derived updates and SUCCESS metadata commit together. Failures roll back the data and persist FAILED metadata separately.
- Plus upserts retain IDs and enforce one row per matching key. Startup migration backs up databases with duplicate Plus keys, retains the latest imported row, repairs references and refreshes derived records.
- CVR production and defect lookups use exact item and lot strings, preserving leading zeroes.
- Mapping changes and CVR recalculation share a transaction. SSE notifications are sent after commit; background scan cycles also notify clients.
- `app.corsOrigins` and `app.jwt.expiresIn` apply at runtime. Restart after configuration edits.
- Scan calculation settings control OP fields/separators and time anomaly text. Duration supports integer minutes; unsupported modes are rejected. JSON formula descriptions are not executable expressions.
- Scan validation requires configured matching keys. Shift/pressure/Cpk recommendations flag anomalies while retaining measurements. Day/Night are allowed alongside A/B/C.

## Authentication setup

Set JWT_SECRET (at least 32 characters) to supply a deployment key. Otherwise a random persistent key is created at runtime/jwt-secret. Replacing the previous built-in key invalidates old sessions once; users must sign in again.

Existing account passwords are preserved. On a fresh database, INITIAL_ADMIN_PASSWORD and INITIAL_USER_PASSWORD (at least 12 characters) set initial credentials. If omitted, random credentials are saved to runtime/initial-credentials.json. Restrict access to the runtime directory and change initial passwords after setup. Credentials are not printed to logs.

## Removed unused errors page

The unused ErrorsPage, API client/types, controller and route were removed. New databases no longer create import_errors. Existing legacy tables remain untouched to preserve historical data. File failure status and dashboard counters remain available.

## Verification

Run npm run test:regressions, npm run test:cvr-mapping and npm run test:cvr-matching. The regression suite uses temporary SQLite files to exercise real transactions. API/database/scanner integration scripts also use isolated temporary databases; APP_DATABASE_URL overrides the normal database path for tests.

## Soft exclusion and audit

- `scan4m:manage` and `cvr4m:manage` allow excluding/restoring records of the corresponding report. Both are selectable on account create/edit. `audit:view` grants access to the read-only operation history page/API.
- Report lists default to active rows. `visibility=excluded` requires the report manage permission as well as its normal view permission. Statistics, top-machine summaries and Excel always exclude hidden rows.
- Exclusions are persisted in a separate table: Scan uses match_key; CVR uses exact item/lot/sequence/start-time/machine identity. Reimporting or rebuilding derived records does not remove the exclusion. Source data remains available for matching and restoration.
- Exclude requires a reason; restore is explicit. Both capture the record snapshot and audit in the same transaction. Account and mapping mutations also roll back when their audit cannot be written.
- Audit records include actor username snapshots, timestamps, action, resource, result and redacted details. They cover login/logout, password operations, account create/edit/lock, mapping create/edit/delete/restore, report exclusion/restoration, exports, manual scans, reads and failed requests. No edit/delete endpoint for audit is exposed. Existing unlogged actions cannot be reconstructed retroactively.
- Exports and manual scans persist STARTED before executing, then update to SUCCESS/FAILED. STARTED remaining after interruption means the result was not confirmed. Automatic background work has no account actor and is recorded by the operational logger.
- New backend layers: domain defines repository ports and record identity; application contains record/audit use cases; infrastructure implements SQLite repositories; composition wires transactions/adapters; HTTP controllers validate request shape and map responses. Existing unrelated controllers retain their previous structure.
- `npm run test:record-audit` exercises exclusion across rebuilds, visibility in list/statistics/Excel, restoration, permissions, audit rollback, before/after snapshots and credential redaction using isolated databases.
