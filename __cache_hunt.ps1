$out = "c:\Users\haait\OneDrive\Desktop\PROJECTS\trading-app\__cache_hunt.txt"
$lines = @()

# 1. npm cache
$npmCache = "C:\Users\haait\AppData\Local\npm-cache"
$lines += "=== npm cache ($npmCache) ==="
if (Test-Path $npmCache) {
    $s = (Get-ChildItem $npmCache -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  Size: $gb GB"
}
else {
    $lines += "  NOT FOUND"
}

# 2. Vercel local cache
$vercelLocal = Join-Path $env:LOCALAPPDATA "Vercel"
$lines += ""
$lines += "=== Vercel local ($vercelLocal) ==="
if (Test-Path $vercelLocal) {
    $s = (Get-ChildItem $vercelLocal -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  Size: $gb GB"
}
else {
    $lines += "  NOT FOUND"
}

# 3. Next.js telemetry / cache in AppData
$nextLocal = Join-Path $env:LOCALAPPDATA "next"
$lines += ""
$lines += "=== Next.js local ($nextLocal) ==="
if (Test-Path $nextLocal) {
    $s = (Get-ChildItem $nextLocal -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  Size: $gb GB"
}
else {
    $lines += "  NOT FOUND"
}

# 4. .vercel inside project
$vercelProj = "c:\Users\haait\OneDrive\Desktop\PROJECTS\trading-app\.vercel"
$lines += ""
$lines += "=== .vercel in project ($vercelProj) ==="
if (Test-Path $vercelProj) {
    $s = (Get-ChildItem $vercelProj -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $mb = [math]::Round($s / 1MB, 2)
    $lines += "  Size: $mb MB"
    Get-ChildItem $vercelProj -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            $ss = (Get-ChildItem $_.FullName -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $lines += "    $($_.Name): $([math]::Round($ss / 1MB, 2)) MB"
        }
        else {
            $lines += "    $($_.Name): $([math]::Round($_.Length / 1MB, 2)) MB"
        }
    }
}
else {
    $lines += "  NOT FOUND"
}

# 5. Check for turbo cache
$turboCache = "c:\Users\haait\OneDrive\Desktop\PROJECTS\trading-app\.turbo"
$lines += ""
$lines += "=== .turbo cache ($turboCache) ==="
if (Test-Path $turboCache) {
    $s = (Get-ChildItem $turboCache -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  Size: $gb GB"
}
else {
    $lines += "  NOT FOUND"
}

# 6. AppData\Roaming\npm
$npmRoaming = Join-Path $env:APPDATA "npm"
$lines += ""
$lines += "=== npm global ($npmRoaming) ==="
if (Test-Path $npmRoaming) {
    $s = (Get-ChildItem $npmRoaming -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  Size: $gb GB"
}
else {
    $lines += "  NOT FOUND"
}

# 7. npx cache
$npxCache = Join-Path $env:LOCALAPPDATA "npm-cache\_npx"
$lines += ""
$lines += "=== npx cache ($npxCache) ==="
if (Test-Path $npxCache) {
    $s = (Get-ChildItem $npxCache -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  Size: $gb GB"
}
else {
    $lines += "  NOT FOUND"
}

# 8. Total PROJECTS folder size for comparison
$projectsDir = "c:\Users\haait\OneDrive\Desktop\PROJECTS"
$lines += ""
$lines += "=== Total PROJECTS folder ==="
$s = (Get-ChildItem $projectsDir -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$gb = [math]::Round($s / 1GB, 2)
$lines += "  Size: $gb GB"

# 9. Check other projects in PROJECTS folder
$lines += ""
$lines += "=== All projects in PROJECTS folder ==="
Get-ChildItem $projectsDir -Directory | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -Force -EA SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($s / 1GB, 2)
    $lines += "  $($_.Name): $gb GB"
}

$lines | Out-File $out -Encoding utf8
Write-Host "Done. Output at $out"
