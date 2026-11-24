$BASE = "https://outbox-app-production.up.railway.app"
$results = [ordered]@{}

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " OUTBOX - FULL FEATURE TEST" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# ── Auth ──────────────────────────────────────────────────────
Write-Host "[1/11] Demo login..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/auth/demo" -Method POST -UseBasicParsing -TimeoutSec 10 -Headers @{"Content-Type"="application/json"} -Body "{}").Content | ConvertFrom-Json
    $token = $r.token
    $h = @{"Authorization"="Bearer $token";"Content-Type"="application/json"}
    $results["01 Demo Login"] = "PASS  user=$($r.user.name) ($($r.user.email))"
    Write-Host " PASS" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["01 Demo Login"] = "FAIL  $($_.Exception.Message)"
    exit 1
}

Write-Host "[2/11] Auth /me with Bearer token..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/auth/me" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $results["02 Auth /me"] = "PASS  id=$($r.user.id)"
    Write-Host " PASS" -ForegroundColor Green
} catch {
    Write-Host " FAIL: $($_.Exception.Message)" -ForegroundColor Red
    $results["02 Auth /me"] = "FAIL  $($_.Exception.Message)"
}

# ── Senders ───────────────────────────────────────────────────
Write-Host "[3/11] Email senders list..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/emails/senders" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $count = $r.senders.Count
    $email = if ($count -gt 0) { $r.senders[0].email } else { "none" }
    $results["03 Senders"] = "PASS  $count sender(s): $email"
    if ($count -eq 0) { $results["03 Senders"] = "WARN  0 senders configured" }
    Write-Host " PASS ($count senders)" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["03 Senders"] = "FAIL  $($_.Exception.Message)"
}

# ── Schedule email ────────────────────────────────────────────
Write-Host "[4/11] Schedule test email (BullMQ)..." -NoNewline
$schedAt = (Get-Date).AddSeconds(8).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$body = "{`"senderEmail`":`"wghpeo543ew4iidb@ethereal.email`",`"recipients`":[`"inbox.test@example.com`"],`"subject`":`"Outbox Feature Test`",`"body`":`"Automated test from Outbox scheduler. BullMQ + Ethereal.`",`"scheduledAt`":`"$schedAt`",`"hourlyLimit`":100,`"minDelaySeconds`":2}"
try {
    $r = (Invoke-WebRequest "$BASE/api/emails/schedule" -Method POST -UseBasicParsing -TimeoutSec 10 -Headers $h -Body $body).Content | ConvertFrom-Json
    $script:emailId = $r.emails[0].id
    $results["04 Schedule Email"] = "PASS  created=$($r.created) id=$($r.emails[0].id) status=$($r.emails[0].status)"
    Write-Host " PASS (id=$($r.emails[0].id))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["04 Schedule Email"] = "FAIL  $($_.Exception.Message)"
}

# ── List scheduled ────────────────────────────────────────────
Write-Host "[5/11] List scheduled emails..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/emails?status=SCHEDULED" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $results["05 List Scheduled"] = "PASS  total=$($r.total)"
    Write-Host " PASS (total=$($r.total))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["05 List Scheduled"] = "FAIL  $($_.Exception.Message)"
}

# ── Email counts ──────────────────────────────────────────────
Write-Host "[6/11] Email counts (badge data)..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/emails/counts" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $results["06 Email Counts"] = "PASS  scheduled=$($r.scheduled) sent=$($r.sent) failed=$($r.failed)"
    Write-Host " PASS (sched=$($r.scheduled) sent=$($r.sent))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["06 Email Counts"] = "FAIL  $($_.Exception.Message)"
}

# ── Wait for BullMQ worker to process the email ───────────────
Write-Host "[7/11] Wait 25s for BullMQ worker to send email..." -NoNewline
Start-Sleep -Seconds 25
Write-Host " done" -ForegroundColor Yellow

# ── Check if email was sent ───────────────────────────────────
Write-Host "[8/11] Verify email was sent (check SENT list)..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/emails?status=SENT" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $counts = (Invoke-WebRequest "$BASE/api/emails/counts" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    if ($r.total -gt 0) {
        $preview = $r.emails[0].etherealPreviewUrl
        $results["08 Email Sent"] = "PASS  total_sent=$($r.total) preview=$preview"
        Write-Host " PASS (sent=$($r.total), preview=$preview)" -ForegroundColor Green
    } else {
        $results["08 Email Sent"] = "WARN  scheduled=$($counts.scheduled) sent=$($counts.sent) failed=$($counts.failed) - email may still be processing"
        Write-Host " WARN (not yet sent, sched=$($counts.scheduled) failed=$($counts.failed))" -ForegroundColor Yellow
    }
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["08 Email Sent"] = "FAIL  $($_.Exception.Message)"
}

# ── Elasticsearch search ──────────────────────────────────────
Write-Host "[9/11] Elasticsearch full-text search..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/emails/search?q=Outbox&status=ALL" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $results["09 ES Search"] = "PASS  results=$($r.total) (q=Outbox)"
    Write-Host " PASS (results=$($r.total))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["09 ES Search"] = "FAIL  $($_.Exception.Message)"
}

# ── Slack status ──────────────────────────────────────────────
Write-Host "[10/11] Slack integration status..." -NoNewline
try {
    $r = (Invoke-WebRequest "$BASE/api/slack/status" -UseBasicParsing -TimeoutSec 10 -Headers $h).Content | ConvertFrom-Json
    $results["10 Slack Status"] = "PASS  connected=$($r.connected)"
    Write-Host " PASS (connected=$($r.connected))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["10 Slack Status"] = "FAIL  $($_.Exception.Message)"
}

# ── Bull Board ────────────────────────────────────────────────
Write-Host "[11/11] Bull Board dashboard..." -NoNewline
try {
    $r = Invoke-WebRequest "$BASE/admin/queues" -UseBasicParsing -TimeoutSec 10
    $results["11 Bull Board"] = "PASS  HTTP $($r.StatusCode) size=$($r.Content.Length)b"
    Write-Host " PASS (HTTP $($r.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host " FAIL" -ForegroundColor Red
    $results["11 Bull Board"] = "FAIL  $($_.Exception.Message)"
}

# ── Summary ───────────────────────────────────────────────────
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host " RESULTS" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
$pass = 0; $fail = 0; $warn = 0
$results.GetEnumerator() | ForEach-Object {
    $color = if ($_.Value -match "^PASS") { $pass++; "Green" } elseif ($_.Value -match "^WARN") { $warn++; "Yellow" } else { $fail++; "Red" }
    Write-Host "  $($_.Key): $($_.Value)" -ForegroundColor $color
}
Write-Host "`n  Total: $($pass) PASS, $($warn) WARN, $($fail) FAIL" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan
