$base = "c:\Users\haait\OneDrive\Desktop\PROJECTS\trading-app"
$dirs = @(".next", ".git", ".vercel", "node_modules", "data", "supabase", "src", "docs", "scripts")
foreach ($d in $dirs) {
    $full = Join-Path $base $d
    if (Test-Path $full) {
        $s = (Get-ChildItem $full -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $mb = [math]::Round($s / 1MB, 2)
        Write-Host "$d : $mb MB"
    }
}
