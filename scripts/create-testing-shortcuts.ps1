param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\testing-build.local'),
    [string]$ShortcutDirectory
)
$ErrorActionPreference = 'Stop'
$ConfigPath = (Resolve-Path -LiteralPath $ConfigPath).Path
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$shortcutShell = New-Object -ComObject WScript.Shell
if (-not $ShortcutDirectory) { $ShortcutDirectory = $shortcutShell.SpecialFolders.Item('Desktop') }
$ShortcutDirectory = (Resolve-Path -LiteralPath $ShortcutDirectory).Path
$launcherPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'load-testing.ps1')).Path
$iconDirectory = Join-Path $PSScriptRoot 'launcher-icons'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
Add-Type -AssemblyName System.Drawing

function Write-PngIcon([byte[]]$Bytes, [string]$Destination) {
    # Store the original PNG losslessly in a Windows ICO container.
    $pngStream = [IO.MemoryStream]::new($Bytes, $false)
    $png = [Drawing.Image]::FromStream($pngStream)
    try {
        if ($png.Width -gt 256 -or $png.Height -gt 256) { throw 'Shortcut icon exceeds 256 pixels.' }
        $stream = [IO.File]::Create($Destination)
        $writer = [IO.BinaryWriter]::new($stream)
        try {
            $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
            $writer.Write([byte]($png.Width % 256)); $writer.Write([byte]($png.Height % 256))
            $writer.Write([byte]0); $writer.Write([byte]0)
            $writer.Write([uint16]1); $writer.Write([uint16]32)
            $writer.Write([uint32]$Bytes.Length); $writer.Write([uint32]22)
            $writer.Write($Bytes)
        } finally { $writer.Dispose(); $stream.Dispose() }
    } finally { $png.Dispose(); $pngStream.Dispose() }
}

$aegisPng = Join-Path $config.extensionDirectory 'Pouka_Logo_128.png'
$dimsumPng = Join-Path $config.launcher.dimsumDirectory 'icons\dim-sum-128.png'
Write-PngIcon ([IO.File]::ReadAllBytes($aegisPng)) (Join-Path $iconDirectory 'aegis.ico')
Write-PngIcon ([IO.File]::ReadAllBytes($dimsumPng)) (Join-Path $iconDirectory 'dimsum.ico')

# A native vector drawing keeps the combined shortcut distinct at small sizes.
$bitmap = [Drawing.Bitmap]::new(128, 128)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$gold = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#f5c451'))
$teal = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#52d3c5'))
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#172131'))
$font = [Drawing.Font]::new('Segoe UI', 35, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
$format = [Drawing.StringFormat]::new()
$format.Alignment = [Drawing.StringAlignment]::Center
$format.LineAlignment = [Drawing.StringAlignment]::Center
$pngOutput = [IO.MemoryStream]::new()
try {
    $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.FillEllipse($ink, 1, 1, 126, 126)
    $graphics.FillRectangle($gold, 15, 16, 66, 66)
    $graphics.DrawString('A', $font, $ink, [Drawing.RectangleF]::new(15, 12, 66, 66), $format)
    $graphics.FillRectangle($ink, 45, 45, 71, 71)
    $graphics.FillRectangle($teal, 50, 50, 63, 63)
    $graphics.DrawString('D', $font, $ink, [Drawing.RectangleF]::new(50, 47, 63, 63), $format)
    $bitmap.Save($pngOutput, [Drawing.Imaging.ImageFormat]::Png)
    Write-PngIcon ($pngOutput.ToArray()) (Join-Path $iconDirectory 'both.ico')
} finally {
    $pngOutput.Dispose(); $format.Dispose(); $font.Dispose()
    $gold.Dispose(); $teal.Dispose(); $ink.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}

$shortcutTarget = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$choices = @(
    @{ Name = 'Reload Aegis Testing'; Selection = 'Aegis'; Icon = 'aegis.ico' },
    @{ Name = 'Reload DIMSUM Testing'; Selection = 'DIMSUM'; Icon = 'dimsum.ico' },
    @{ Name = 'Reload Aegis + DIMSUM Testing'; Selection = 'Both'; Icon = 'both.ico' }
)
foreach ($choice in $choices) {
    $shortcutPath = Join-Path $ShortcutDirectory ($choice.Name + '.lnk')
    $shortcut = $shortcutShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $shortcutTarget
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcherPath + '" -ConfigPath "' + $ConfigPath + '" -Extensions ' + $choice.Selection
    $shortcut.WorkingDirectory = Split-Path $PSScriptRoot -Parent
    $shortcut.IconLocation = (Join-Path $iconDirectory $choice.Icon) + ',0'
    $shortcut.Description = 'Reload ' + $choice.Selection + ' testing extension(s), then refresh DIM.'
    $shortcut.WindowStyle = 7
    $shortcut.Save()
    $verified = $shortcutShell.CreateShortcut($shortcutPath)
    if ($verified.TargetPath -ne $shortcutTarget -or $verified.Arguments -ne $shortcut.Arguments -or $verified.IconLocation -ne $shortcut.IconLocation) {
        throw "Shortcut verification failed: $shortcutPath"
    }
    Write-Output "Created and verified: $shortcutPath"
}

# Replace only the old shortcut belonging to this launcher, after all three verify.
$oldShortcutPath = Join-Path $ShortcutDirectory 'Load Aegis Testing.lnk'
if (Test-Path -LiteralPath $oldShortcutPath) {
    $oldShortcut = $shortcutShell.CreateShortcut($oldShortcutPath)
    if ($oldShortcut.TargetPath -eq $shortcutTarget -and $oldShortcut.Arguments.Contains('"' + $launcherPath + '"')) {
        Remove-Item -LiteralPath $oldShortcutPath
        Write-Output 'Replaced the old Load Aegis Testing shortcut.'
    }
}
