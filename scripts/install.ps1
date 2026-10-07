param(
    [Parameter(Mandatory = $true)][string]$VaultPath,
    [string]$PluginPath = (Join-Path (Split-Path $PSScriptRoot -Parent) 'release\prism-studio')
)
$ErrorActionPreference = 'Stop'
$prismVault = (Resolve-Path -LiteralPath $VaultPath).Path
if (-not (Test-Path -LiteralPath $prismVault -PathType Container)) { throw 'VaultPath must be a directory.' }
$prismConfig = Join-Path $prismVault '.obsidian'
if (-not (Test-Path -LiteralPath $prismConfig -PathType Container)) { throw 'This is not an Obsidian vault: .obsidian is missing.' }
$prismSource = (Resolve-Path -LiteralPath $PluginPath).Path
$prismManifest = Get-Content -LiteralPath (Join-Path $prismSource 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($prismManifest.id -ne 'prism-studio') { throw 'Unexpected plugin manifest. Installation stopped.' }
foreach ($prismFile in @('manifest.json', 'main.js', 'styles.css')) {
    if (-not (Test-Path -LiteralPath (Join-Path $prismSource $prismFile) -PathType Leaf)) { throw "Missing release file: $prismFile" }
}
$prismSourceFonts = Join-Path $prismSource 'fonts'
if (-not (Test-Path -LiteralPath $prismSourceFonts -PathType Container)) { throw 'Missing release directory: fonts' }
if (-not (Get-ChildItem -LiteralPath $prismSourceFonts -File -Recurse | Where-Object { $_.Extension -in @('.ttf', '.woff2') } | Select-Object -First 1)) { throw 'The release fonts directory contains no font files.' }
$prismDestination = [System.IO.Path]::GetFullPath((Join-Path $prismConfig 'plugins\prism-studio'))
$prismPluginRoot = [System.IO.Path]::GetFullPath((Join-Path $prismConfig 'plugins'))
if (-not $prismDestination.StartsWith($prismPluginRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid plugin destination.' }
$prismDestinationFonts = [System.IO.Path]::GetFullPath((Join-Path $prismDestination 'fonts'))
if (-not $prismDestinationFonts.StartsWith($prismDestination + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid fonts destination.' }
if (Test-Path -LiteralPath $prismDestinationFonts) {
    if (-not (Test-Path -LiteralPath $prismDestinationFonts -PathType Container)) { throw 'The fonts destination must be a directory.' }
    $prismExistingFontEntries = @(Get-Item -LiteralPath $prismDestinationFonts) + @(Get-ChildItem -LiteralPath $prismDestinationFonts -Recurse -Force)
    if ($prismExistingFontEntries | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint } | Select-Object -First 1) { throw 'The fonts destination contains a link. Installation stopped to keep font files inside the plugin.' }
}
if (Test-Path -LiteralPath (Join-Path $prismDestination 'manifest.json')) {
    $prismExisting = Get-Content -LiteralPath (Join-Path $prismDestination 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($prismExisting.id -ne 'prism-studio') { throw 'Destination contains a different plugin. Installation stopped.' }
    $prismBackup = Join-Path $prismConfig ('prism-studio-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
    New-Item -ItemType Directory -Path $prismBackup -Force | Out-Null
    foreach ($prismFile in @('manifest.json', 'main.js', 'styles.css', 'data.json')) {
        $prismOriginal = Join-Path $prismDestination $prismFile
        if (Test-Path -LiteralPath $prismOriginal -PathType Leaf) { Copy-Item -LiteralPath $prismOriginal -Destination (Join-Path $prismBackup $prismFile) }
    }
    if (Test-Path -LiteralPath $prismDestinationFonts -PathType Container) { Copy-Item -LiteralPath $prismDestinationFonts -Destination $prismBackup -Recurse }
    Write-Output "Previous plugin files backed up to: $prismBackup"
}
New-Item -ItemType Directory -Path $prismDestination -Force | Out-Null
foreach ($prismFile in @('manifest.json', 'main.js', 'styles.css')) {
    Copy-Item -LiteralPath (Join-Path $prismSource $prismFile) -Destination (Join-Path $prismDestination $prismFile) -Force
}
Copy-Item -LiteralPath $prismSourceFonts -Destination $prismDestination -Recurse -Force
Write-Output "Installed Prism Studio $($prismManifest.version) to: $prismDestination"
Write-Output 'Open Obsidian Settings > Community plugins, then enable Prism Studio. Existing data.json was preserved.'
