$base = "c:\Users\haait\OneDrive\Desktop\PROJECTS\trading-app"

Write-Host "=== .next subdirectories ==="
$nextDir = Join-Path $base ".next"
if (Test-Path $nextDir) {
    Get-ChildItem $nextDir -Directory -Force | ForEach-Object {
        $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $mb = [math]::Round($s / 1MB, 2)
        Write-Host "  $($_.Name) : $mb MB"
    }
}

Write-Host ""
Write-Host "=== Top 20 largest node_modules packages ==="
$nmDir = Join-Path $base "node_modules"
if (Test-Path $nmDir) {
    $results = Get-ChildItem $nmDir -Directory -Force | ForEach-Object {
        $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{ Name = $_.Name; SizeMB = [math]::Round($s / 1MB, 2) }
    } | Sort-Object SizeMB -Descending | Select-Object -First 20
    $results | Format-Table -AutoSize
}

Write-Host ""
Write-Host "=== data subdirectories ==="
$dataDir = Join-Path $base "data"
if (Test-Path $dataDir) {
    Get-ChildItem $dataDir -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $mb = [math]::Round($s / 1MB, 2)
            Write-Host "  $($_.Name) : $mb MB (dir)"
        } else {
            $mb = [math]::Round($_.Length / 1MB, 2)
            Write-Host "  $($_.Name) : $mb MB (file)"
        }
    }
}

Write-Host ""
Write-Host "=== .next/cache contents ==="
$cacheDir = Join-Path $base ".next\cache"
if (Test-Path $cacheDir) {
    Get-ChildItem $cacheDir -Force | ForEach-Object {
        if ($_.PSIsContainer) {
            $s = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $mb = [math]::Round($s / 1MB, 2)
            Write-Host "  $($_.Name) : $mb MB (dir)"
        } else {
            $mb = [math]::Round($_.Length / 1MB, 2)
            Write-Host "  $($_.Name) : $mb MB (file)"
        }
    }
}
