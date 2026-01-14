# Test Templates API - Windows PowerShell Script
# No Unicode characters for compatibility

Write-Host ""
Write-Host "Testing Chain Templates API..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Legacy endpoint
Write-Host "Test 1: Legacy API (/api/chains/templates)" -ForegroundColor Yellow
try {
    $legacy = Invoke-WebRequest -Uri http://localhost:3001/api/chains/templates -UseBasicParsing
    Write-Host "  [OK] Status: $($legacy.StatusCode)" -ForegroundColor Green
    Write-Host "  [OK] Deprecation: $($legacy.Headers['Deprecation'])" -ForegroundColor Green
    Write-Host "  [OK] Link: $($legacy.Headers['Link'])" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] $_" -ForegroundColor Red
}

# Test 2: New endpoint
Write-Host ""
Write-Host "Test 2: New API (/v1/chains/templates)" -ForegroundColor Yellow
try {
    $new = Invoke-WebRequest -Uri http://localhost:3001/v1/chains/templates -UseBasicParsing
    Write-Host "  [OK] Status: $($new.StatusCode)" -ForegroundColor Green
    
    $data = $new.Content | ConvertFrom-Json
    Write-Host "  [OK] Total templates: $($data.data.total)" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "  Templates:" -ForegroundColor Cyan
    $data.data.templates | ForEach-Object {
        Write-Host "    - $($_.name) [$($_.category)/$($_.complexity)]" -ForegroundColor White
    }
} catch {
    Write-Host "  [ERROR] $_" -ForegroundColor Red
}

# Test 3: Category filter
Write-Host ""
Write-Host "Test 3: Category Filter (?category=social)" -ForegroundColor Yellow
try {
    $filtered = Invoke-WebRequest -Uri "http://localhost:3001/v1/chains/templates?category=social" -UseBasicParsing
    $data = $filtered.Content | ConvertFrom-Json
    Write-Host "  [OK] Filtered templates: $($data.data.total)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] $_" -ForegroundColor Red
}

# Test 4: Specific template
Write-Host ""
Write-Host "Test 4: Get Specific Template (heusdenpas-full)" -ForegroundColor Yellow
try {
    $specific = Invoke-WebRequest -Uri http://localhost:3001/v1/chains/templates/heusdenpas-full -UseBasicParsing
    $data = $specific.Content | ConvertFrom-Json
    Write-Host "  [OK] Template: $($data.data.name)" -ForegroundColor Green
    Write-Host "  [OK] DMNs: $($data.data.dmnIds.Count)" -ForegroundColor Green
    Write-Host "  [OK] Estimated time: $($data.data.estimatedTime)ms" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "All tests complete!" -ForegroundColor Green
Write-Host ""