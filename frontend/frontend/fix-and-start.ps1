Write-Host "========================================"
Write-Host "Fixing React Scripts and Starting App"
Write-Host "========================================"
Write-Host ""

Write-Host "Step 1: Removing broken node_modules..."
if (Test-Path "node_modules") {
    Remove-Item -Recurse -Force "node_modules"
    Write-Host "node_modules removed"
}
if (Test-Path "package-lock.json") {
    Remove-Item -Force "package-lock.json"
    Write-Host "package-lock.json removed"
}

Write-Host ""
Write-Host "Step 2: Installing fresh dependencies..."
npm install --no-audit --no-fund

Write-Host ""
Write-Host "Step 3: Setting Node options for compatibility..."
$env:NODE_OPTIONS = "--openssl-legacy-provider"

Write-Host ""
Write-Host "Step 4: Starting the application..."
npm start