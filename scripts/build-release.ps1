# scripts/build-release.ps1
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Set-Location $projectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SachalAI Release & Update Builder    " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Read tauri.conf.json
$tauriConfPath = Join-Path $projectRoot "src-tauri\tauri.conf.json"
$tauriConf = Get-Content $tauriConfPath -Raw | ConvertFrom-Json
$version = $tauriConf.version
$productName = $tauriConf.productName

Write-Host "Building release for: $productName v$version" -ForegroundColor Green

# 2. Check private signing key
$keyPath = Join-Path $projectRoot "src-tauri\sachalai.key"
if (-not (Test-Path $keyPath)) {
    Write-Error "Private key not found at $keyPath! Make sure sachalai.key exists."
    exit 1
}

$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "sachalai"

# 3. Check endpoint
$endpoint = $tauriConf.plugins.updater.endpoints[0]
Write-Host "Configured update endpoint: $endpoint" -ForegroundColor Yellow

if ($endpoint -match "github\.com/sachal/sachalai") {
    Write-Host "`n[NOTE] Endpoint currently uses placeholder 'sachal/sachalai'." -ForegroundColor Magenta
    Write-Host "When you create your own GitHub repo, update 'endpoints' in src-tauri/tauri.conf.json with your username/repo.`n" -ForegroundColor Magenta
}

# 4. Run Tauri Build
Write-Host "Building frontend & Rust desktop binary..." -ForegroundColor Cyan
npm run tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Tauri build failed!"
    exit $LASTEXITCODE
}

# 5. Locate bundle output
$bundleDir = Join-Path $projectRoot "src-tauri\target\release\bundle"
$outputDir = Join-Path $projectRoot "release-artifacts"

if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
} else {
    Remove-Item (Join-Path $outputDir "*") -Recurse -Force -ErrorAction SilentlyContinue
}

# Find installers (.msi and .exe)
$msiFile = Get-ChildItem -Path (Join-Path $bundleDir "msi") -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
$exeFile = Get-ChildItem -Path (Join-Path $bundleDir "nsis") -Filter "*setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

# Find updater zip and sig
$updaterZip = Get-ChildItem -Path $bundleDir -Filter "*.zip" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
$updaterSig = Get-ChildItem -Path $bundleDir -Filter "*.zip.sig" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1

if ($msiFile) {
    Copy-Item $msiFile.FullName -Destination $outputDir -Force
    Write-Host "✓ Copied MSI Installer: $($msiFile.Name)" -ForegroundColor Green
}
if ($exeFile) {
    Copy-Item $exeFile.FullName -Destination $outputDir -Force
    Write-Host "✓ Copied NSIS Installer: $($exeFile.Name)" -ForegroundColor Green
}
if ($updaterZip) {
    Copy-Item $updaterZip.FullName -Destination $outputDir -Force
    Write-Host "✓ Copied Update Package: $($updaterZip.Name)" -ForegroundColor Green
}
if ($updaterSig) {
    Copy-Item $updaterSig.FullName -Destination $outputDir -Force
    Write-Host "✓ Copied Signature File: $($updaterSig.Name)" -ForegroundColor Green
}

# 6. Generate latest.json manifest for GitHub Release
if ($updaterZip -and $updaterSig) {
    $sigContent = (Get-Content $updaterSig.FullName -Raw).Trim()
    
    $downloadUrl = ""
    if ($endpoint -match "github\.com/([^/]+)/([^/]+)") {
        $owner = $matches[1]
        $repo = $matches[2]
        $downloadUrl = "https://github.com/$owner/$repo/releases/download/v$version/$($updaterZip.Name)"
    } else {
        $downloadUrl = "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v$version/$($updaterZip.Name)"
    }

    $latestManifest = [ordered]@{
        version = $version
        notes = "SachalAI v$version update"
        pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        platforms = @{
            "windows-x86_64" = @{
                signature = $sigContent
                url = $downloadUrl
            }
        }
    }

    $jsonPath = Join-Path $outputDir "latest.json"
    $latestManifest | ConvertTo-Json -Depth 5 | Set-Content $jsonPath -Encoding UTF8
    Write-Host "✓ Generated Manifest: latest.json" -ForegroundColor Green
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "            Release Artifacts Ready!                    " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Folder: $outputDir`n" -ForegroundColor Yellow

Get-ChildItem $outputDir | ForEach-Object {
    $sizeMb = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  📁 $($_.Name) ($sizeMb MB)" -ForegroundColor White
}

Write-Host "`n--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "WHAT TO DO NEXT:" -ForegroundColor Cyan
Write-Host "1. For NEW USERS: Share the .msi or setup.exe file."
Write-Host "2. For AUTO-UPDATES:"
Write-Host "   - Open your GitHub repository -> Releases -> 'Draft a new release'"
Write-Host "   - Tag version: v$version"
Write-Host "   - Drag & drop all files from 'release-artifacts' into the release"
Write-Host "   - Click 'Publish release'"
Write-Host "--------------------------------------------------------`n"
