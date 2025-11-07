# PowerShell script to restart backend server
Write-Host "Finding processes on port 3001..." -ForegroundColor Yellow

# Find process on port 3001
$processInfo = netstat -ano | findstr :3001 | findstr LISTENING
if ($processInfo) {
    $pid = ($processInfo -split '\s+')[-1]
    Write-Host "Found process $pid on port 3001" -ForegroundColor Cyan

    # Kill the process
    Write-Host "Stopping process $pid..." -ForegroundColor Yellow
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    Write-Host "Process stopped successfully!" -ForegroundColor Green
} else {
    Write-Host "No process found on port 3001" -ForegroundColor Green
}

# Start backend
Write-Host "`nStarting backend server..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\backend"
npm run dev
