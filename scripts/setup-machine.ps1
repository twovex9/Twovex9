# setup-machine.ps1 — bootstrap een nieuwe Windows-machine voor BS1 development.
#
# Doel: van schone Windows naar productieve BS1-dev-omgeving in <10 minuten.
#
# Wat dit script doet:
#   1. Checkt of vereiste tools aanwezig zijn (git, node, gh, optional: python)
#   2. Toont versie-info + waarschuwingen bij ontbrekende dependencies
#   3. Verifieert git config (user.name + user.email gezet)
#   4. Verifieert GitHub auth (gh auth status)
#   5. Verifieert dat repo correct is gecloned
#   6. Print URL-checklist voor user-actions (Supabase login, Vercel login, etc.)
#   7. Initiëert build:check als test
#
# Gebruik:
#   cd "C:\path\to\besa-suite-etf"
#   pwsh -ExecutionPolicy Bypass -File scripts\setup-machine.ps1
#
# Of vanuit PowerShell direct:
#   .\scripts\setup-machine.ps1

$ErrorActionPreference = "Continue"
$results = @()

function Test-Tool {
    param([string]$Name, [string]$Command, [string]$VersionFlag = "--version", [string]$InstallHint)
    Write-Host "[check] $Name ... " -NoNewline
    try {
        $output = & $Command $VersionFlag 2>&1 | Select-Object -First 1
        if ($LASTEXITCODE -eq 0 -or $output) {
            Write-Host "OK ($output)" -ForegroundColor Green
            return @{ Tool = $Name; Status = "OK"; Version = $output }
        }
    } catch {
        # fall through
    }
    Write-Host "MISSING" -ForegroundColor Red
    if ($InstallHint) {
        Write-Host "        Install: $InstallHint" -ForegroundColor Yellow
    }
    return @{ Tool = $Name; Status = "MISSING"; Hint = $InstallHint }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BS1 dev-machine setup verificatie" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Required tools
Write-Host "## Required tools" -ForegroundColor Cyan
$results += Test-Tool -Name "git" -Command "git" -VersionFlag "--version" -InstallHint "https://git-scm.com/download/win"
$results += Test-Tool -Name "node" -Command "node" -VersionFlag "--version" -InstallHint "https://nodejs.org/ (>= 18)"
$results += Test-Tool -Name "npm" -Command "npm" -VersionFlag "--version" -InstallHint "Komt mee met Node.js"
$results += Test-Tool -Name "gh (GitHub CLI)" -Command "gh" -VersionFlag "--version" -InstallHint "https://cli.github.com/"

# 2. Optional tools
Write-Host ""
Write-Host "## Optional tools" -ForegroundColor Cyan
$results += Test-Tool -Name "python (voor lokale http.server)" -Command "python" -VersionFlag "--version" -InstallHint "https://www.python.org/ (optional)"
$results += Test-Tool -Name "psql (voor pg_dump backups)" -Command "psql" -VersionFlag "--version" -InstallHint "https://www.postgresql.org/download/windows/ (optional)"

# 3. Git config check
Write-Host ""
Write-Host "## Git configuratie" -ForegroundColor Cyan
$gitUser = git config --global user.name 2>$null
$gitEmail = git config --global user.email 2>$null
if ($gitUser) { Write-Host "[check] git user.name ... OK ($gitUser)" -ForegroundColor Green }
else { Write-Host "[check] git user.name ... NIET GEZET" -ForegroundColor Yellow; Write-Host "        Run: git config --global user.name `"<Je Naam>`"" -ForegroundColor Yellow }

if ($gitEmail) { Write-Host "[check] git user.email ... OK ($gitEmail)" -ForegroundColor Green }
else { Write-Host "[check] git user.email ... NIET GEZET" -ForegroundColor Yellow; Write-Host "        Run: git config --global user.email `"<email>`"" -ForegroundColor Yellow }

# 4. GitHub auth
Write-Host ""
Write-Host "## GitHub authenticatie" -ForegroundColor Cyan
$ghAuthOutput = gh auth status 2>&1 | Out-String
if ($ghAuthOutput -match "Logged in to github.com") {
    Write-Host "[check] gh auth ... OK" -ForegroundColor Green
} else {
    Write-Host "[check] gh auth ... NIET INGELOGD" -ForegroundColor Yellow
    Write-Host "        Run: gh auth login" -ForegroundColor Yellow
}

# 5. Repo state
Write-Host ""
Write-Host "## Repo state" -ForegroundColor Cyan
$inRepo = git rev-parse --is-inside-work-tree 2>$null
if ($inRepo -eq "true") {
    $remote = git remote get-url origin 2>$null
    $branch = git rev-parse --abbrev-ref HEAD 2>$null
    Write-Host "[check] In git repo ... OK" -ForegroundColor Green
    Write-Host "        Remote: $remote" -ForegroundColor Gray
    Write-Host "        Branch: $branch" -ForegroundColor Gray
    if ($remote -notmatch "ETFalkmaar/besa-suite") {
        Write-Host "        WARNING: remote is niet ETFalkmaar/besa-suite-" -ForegroundColor Yellow
    }
} else {
    Write-Host "[check] In git repo ... NEE (run dit script vanuit besa-suite-etf/)" -ForegroundColor Red
}

# 6. Package install + build smoke test
Write-Host ""
Write-Host "## Build smoke test" -ForegroundColor Cyan
if (Test-Path "package.json") {
    Write-Host "[check] package.json ... OK" -ForegroundColor Green
    Write-Host "[run] npm run build:check (dry-run cache-busting script)" -ForegroundColor Gray
    npm run build:check 2>&1 | Select-Object -Last 3
} else {
    Write-Host "[check] package.json ... ONTBREEKT (verkeerde directory?)" -ForegroundColor Red
}

# 7. Externe services checklist (user-actie nodig)
Write-Host ""
Write-Host "## Externe services — handmatige login vereist" -ForegroundColor Cyan
Write-Host "  [ ] Supabase Dashboard: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys" -ForegroundColor Gray
Write-Host "  [ ] Vercel Dashboard:   https://vercel.com/etfalkmaars-projects/besa-suite" -ForegroundColor Gray
Write-Host "  [ ] BS2 (sandbox):       https://etf.acceptance.besasuite.nl" -ForegroundColor Gray
Write-Host "  [ ] GitHub repo:         https://github.com/ETFalkmaar/besa-suite-" -ForegroundColor Gray
Write-Host "  [ ] BS1 productie:       https://besa-suite.vercel.app" -ForegroundColor Gray

# 8. Volgende stappen
Write-Host ""
Write-Host "## Volgende stappen" -ForegroundColor Cyan
Write-Host "  1. Fix eventuele MISSING tools hierboven" -ForegroundColor Gray
Write-Host "  2. Lees: CLAUDE.md + .claude/huisstijl.md + .claude/werkpatronen.md" -ForegroundColor Gray
Write-Host "  3. Lees: docs/phase4/04-open-items.md (open issues / toekomstig werk)" -ForegroundColor Gray
Write-Host "  4. Lokaal browsen: python -m http.server 8000  (open http://localhost:8000)" -ForegroundColor Gray
Write-Host ""

# Samenvatting
$missing = $results | Where-Object { $_.Status -eq "MISSING" -and $_.Tool -notmatch "Optional" }
if ($missing.Count -eq 0) {
    Write-Host "✓ Setup verificatie compleet — alle required tools aanwezig" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "⚠ Setup incompleet — $($missing.Count) required tool(s) ontbreken" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
