$base = "c:\Users\haait\OneDrive\Desktop\PROJECTS\trading-app"
$out = Join-Path $base "__sizes.txt"

$lines = @()

$lines += "=== TOP-LEVEL DIRECTORIES ==="
Get-ChildItem $base -Directory -Force | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    $mb = [math]::Round($s / 1MB, 2)
    $lines += "  $($_.Name) : $mb MB"
}

$lines += ""
$lines += "=== .next SUBDIRECTORIES ==="
$nextDir = Join-Path $base ".next"
if (Test-Path $nextDir) {
    Get-ChildItem $nextDir -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $mb = [math]::Round($s / 1MB, 2)
            $lines += "  $($_.Name) : $mb MB"
        } else {
            $mb = [math]::Round($_.Length / 1MB, 2)
            $lines += "  $($_.Name) : $mb MB (file)"
        }
    }
}

$lines += ""
$lines += "=== .next/cache SUBDIRECTORIES ==="
$cacheDir = Join-Path $base ".next\cache"
if (Test-Path $cacheDir) {
    Get-ChildItem $cacheDir -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $mb = [math]::Round($s / 1MB, 2)
            $lines += "  $($_.Name) : $mb MB"
        } else {
            $mb = [math]::Round($_.Length / 1MB, 2)
            $lines += "  $($_.Name) : $mb MB (file)"
        }
    }
}

$lines += ""
$lines += "=== TOP 25 LARGEST node_modules PACKAGES ==="
$nmDir = Join-Path $base "node_modules"
if (Test-Path $nmDir) {
    Get-ChildItem $nmDir -Directory -Force | ForEach-Object {
        $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{ Name = $_.Name; SizeMB = [math]::Round($s / 1MB, 2) }
    } | Sort-Object SizeMB -Descending | Select-Object -First 25 | ForEach-Object {
        $lines += "  $($_.Name) : $($_.SizeMB) MB"
    }
}

$lines += ""
$lines += "=== data CONTENTS ==="
$dataDir = Join-Path $base "data"
if (Test-Path $dataDir) {
    Get-ChildItem $dataDir -Recurse -Force | ForEach-Object {
        if (-not $_.PSIsContainer) {
            $mb = [math]::Round($_.Length / 1MB, 2)
            $rel = $_.FullName.Replace($dataDir + "\", "")
            $lines += "  $rel : $mb MB"
        }
    }
}

$lines += ""
$lines += "=== TOTAL PROJECT SIZE ==="
$totalSize = (Get-ChildItem $base -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
$lines += "  TOTAL: $([math]::Round($totalSize / 1MB, 2)) MB"

$lines | Out-File $out -Encoding utf8
Write-Host "Done. Output written to $out"
