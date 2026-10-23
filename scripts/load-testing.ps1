param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\testing-build.local'),
    [ValidateSet('Aegis', 'DIMSUM', 'Both')]
    [string]$Extensions = 'Both',
    [switch]$ValidateOnly,
    [switch]$RestartZen,
    [switch]$NoDialog
)
$ErrorActionPreference = 'Stop'
$launcherMutex = New-Object System.Threading.Mutex($false, 'Local\AegisTestingLauncher')
$ownsMutex = $false
try {
    $ownsMutex = $launcherMutex.WaitOne(0)
    if (-not $ownsMutex) { return }
    $ConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $browserPath = (Resolve-Path -LiteralPath $config.launcher.browserExecutable).Path
    $profilePath = (Resolve-Path -LiteralPath $config.launcher.profileDirectory).Path
    $nodePath = (Resolve-Path -LiteralPath $config.launcher.nodeExecutable).Path
    if ($Extensions -in @('Aegis', 'Both')) {
        $manifestPath = Join-Path $config.extensionDirectory 'manifest.json'
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.browser_specific_settings.gecko.id -ne 'dim-aegis-overlay@maxeption.github.io') {
            throw 'The configured manifest does not belong to Aegis.'
        }
    }
    if ($Extensions -in @('DIMSUM', 'Both')) {
        if (-not $config.launcher.dimsumDirectory) { throw 'No testing directory configured for DIMSUM.' }
        $dimsumManifest = Get-Content -LiteralPath (Join-Path $config.launcher.dimsumDirectory 'manifest.json') -Raw | ConvertFrom-Json
        if ($dimsumManifest.browser_specific_settings.gecko.id -ne 'dimsum@daphinicus.local') {
            throw 'The configured DIMSUM folder does not contain the expected extension.'
        }
    }
    $debugPort = [int]$config.launcher.port
    if ($debugPort -lt 1024 -or $debugPort -gt 65535) { throw 'Invalid local debugging port.' }
    if ($ValidateOnly) { Write-Output "Launcher configuration valid: $Extensions"; return }

    $browserName = [IO.Path]::GetFileName($browserPath)
    $browserProcesses = @(Get-CimInstance Win32_Process -Filter "Name='$browserName'" |
        Where-Object { $_.ExecutablePath -eq $browserPath -and $_.CommandLine -notmatch '-contentproc' })
    $debugProcesses = @($browserProcesses | Where-Object { $_.CommandLine -match "--remote-debugging-port[= ]$debugPort(?:\s|$)" })
    if ($browserProcesses.Count -gt 0 -and $debugProcesses.Count -eq 0) {
        if (-not $RestartZen) {
            throw 'Close Zen once, then run the testing shortcut again. The launcher needs to start Zen with its local extension-loading connection.'
        }
        if ($browserProcesses.Count -ne 1) { throw 'More than one Zen session is open. Close Zen, then run this launcher again.' }
        # Graceful window close allows Zen to save the session and show any unsaved-work prompts.
        $browserProcess = Get-Process -Id $browserProcesses[0].ProcessId
        if (-not $browserProcess.CloseMainWindow()) { throw 'Zen could not close gracefully. Close it manually, then run this launcher again.' }
        if (-not $browserProcess.WaitForExit(30000)) { throw 'Zen is still open. Finish any prompts, then run this launcher again.' }
        $browserProcesses = @()
    }
    if ($browserProcesses.Count -eq 0) {
        if (Get-NetTCPConnection -LocalPort $debugPort -State Listen -ErrorAction SilentlyContinue) {
            throw 'The configured debugging port is already in use. Zen was not started.'
        }
        # Keep normal browsing preferences: disable the automation preference overrides.
        # This does not enable debugging by itself; only the launch argument below does.
        $userPrefs = Join-Path $profilePath 'user.js'
        $existing = if (Test-Path -LiteralPath $userPrefs) { [IO.File]::ReadAllText($userPrefs) } else { '' }
        $marker = '// Aegis testing launcher: preserve normal browser preferences.'
        if (-not $existing.Contains($marker)) {
            if (Test-Path -LiteralPath $userPrefs) {
                $backup = "$userPrefs.aegis-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
                Copy-Item -LiteralPath $userPrefs -Destination $backup
            }
            [IO.File]::WriteAllText($userPrefs, $existing + "`r`n$marker`r`nuser_pref(`"remote.prefs.recommended`", false);`r`n", (New-Object Text.UTF8Encoding($false)))
        }
        Start-Process -FilePath $browserPath -ArgumentList @('--profile', ('"' + $profilePath + '"'), "--remote-debugging-port=$debugPort") -WindowStyle Hidden | Out-Null
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        $listener = @(Get-NetTCPConnection -LocalPort $debugPort -State Listen -ErrorAction SilentlyContinue)
        if ($listener.Count) { break }
        Start-Sleep -Milliseconds 400
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $listener.Count) { throw 'Zen did not start its local debugging connection within 30 seconds.' }
    foreach ($endpoint in $listener) {
        if ($endpoint.LocalAddress -notin @('127.0.0.1', '::1')) { throw 'The debugging listener is not restricted to this computer.' }
        $owner = Get-Process -Id $endpoint.OwningProcess
        if ($owner.Path -ne $browserPath) { throw 'The local debugging port belongs to another application.' }
    }
    $output = & $nodePath (Join-Path $PSScriptRoot 'load-testing.mjs') $ConfigPath $Extensions.ToLowerInvariant() 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
    Write-Output $output
    $loadRecord = Get-Content -LiteralPath (Join-Path (Split-Path $config.extensionDirectory -Parent) 'last-load.json') -Raw | ConvertFrom-Json
    if (-not $NoDialog -and $loadRecord.warnings.Count -gt 0) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show(($loadRecord.warnings -join "`n`n"), 'DIM testing - site access', 'OK', 'Warning') | Out-Null
    }
} catch {
    if ($NoDialog) { throw }
    Add-Type -AssemblyName System.Windows.Forms
    [Windows.Forms.MessageBox]::Show($_.Exception.Message, "Reload $Extensions Testing", 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if ($ownsMutex) { $launcherMutex.ReleaseMutex() }
    $launcherMutex.Dispose()
}
