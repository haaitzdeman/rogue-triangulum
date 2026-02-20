# Production Backend Workflow

All operations use backend API endpoints only — no UI navigation required.

---

## STEP 1 — Read-Only Smoke

Verify all subsystems are healthy before doing anything.

**Endpoint:** `POST /api/dev/smoke/paper-e2e`

```powershell
$t = "YOUR_ADMIN_TOKEN"
$h = @{"x-admin-token"=$t}
$b = "https://rogue-triangulum.vercel.app"
Invoke-RestMethod "$b/api/dev/smoke/paper-e2e" -Method POST -Headers $h | ConvertTo-Json -Depth 3
```

```bash
curl -s -X POST "$BASE/api/dev/smoke/paper-e2e" -H "x-admin-token: $TOKEN" | jq .
```

**PASS:** `status: "PASS"`, all 3 checks (ACCOUNTING, RISK_STATE, BROKER) pass.
**FAIL:** One or more subsystems down — fix before proceeding.

---

## STEP 2 — Broker Sync

Pull fills from Alpaca paper account into the database.

**Endpoint:** `POST /api/broker/alpaca/sync`

```powershell
Invoke-RestMethod "$b/api/broker/alpaca/sync" -Method POST -ContentType "application/json" -Body '{"dryRun": false}'
```

```bash
curl -s -X POST "$BASE/api/broker/alpaca/sync" -H "Content-Type: application/json" -d '{"dryRun": false}' | jq .
```

**PASS:** `success: true`, `fetchedCount >= 0`, no `errorCode`.
**FAIL:** `success: false` — check `error` and `errorCode` fields.

> Dry run first: set `"dryRun": true` to preview without DB writes.

---

## STEP 3 — Ledger Verification

Confirm realized PnL and trade count are recorded in the immutable ledger.

**Endpoint:** `GET /api/accounting/daily-summary?date=YYYY-MM-DD`

```powershell
$date = (Get-Date).ToString("yyyy-MM-dd")
Invoke-RestMethod "$b/api/accounting/daily-summary?date=$date"
```

```bash
curl -s "$BASE/api/accounting/daily-summary?date=$(date +%Y-%m-%d)" | jq .
```

**PASS:** `success: true`, `tradeCount` and `realizedPnl` reflect your trades.
**FAIL:** `success: false` or `tradeCount: 0` when trades should exist — re-run sync (Step 2).

---

## STEP 4 — Risk Verification

Confirm risk engine reflects ledger-sourced PnL and position counts.

**Endpoint:** `GET /api/today/risk-state`

```powershell
Invoke-RestMethod "$b/api/today/risk-state"
```

```bash
curl -s "$BASE/api/today/risk-state" | jq .
```

**PASS:** `success: true`, `realizedPnl` matches ledger, `openPositions` is accurate.
**FAIL:** `success: false` — check Supabase connectivity.

---

## STEP 5 — Full Pipeline Validation (One-Shot)

Run all checks in a single call and get the current trade lifecycle state.

**Endpoint:** `POST /api/dev/smoke/paper-trade-lifecycle`

```powershell
Invoke-RestMethod "$b/api/dev/smoke/paper-trade-lifecycle" -Method POST -Headers $h | ConvertTo-Json -Depth 3
```

```bash
curl -s -X POST "$BASE/api/dev/smoke/paper-trade-lifecycle" -H "x-admin-token: $TOKEN" | jq .
```

**PASS:** `status: "PASS"`, all checks green.

**nextAction values:**
| Value | Meaning |
|-------|---------|
| `WAITING_FOR_FIRST_TRADE` | No trades today — place one in Alpaca paper |
| `TRADE_OPEN` | Position active — wait for exit fill |
| `TRADE_CLOSED` | Trade completed — PnL in ledger |
