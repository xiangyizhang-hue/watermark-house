param([string]$Version = '0.3.6')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Split-Path $PSScriptRoot -Parent
$delivery = Join-Path $root "artifacts/android/$Version-delivery"
New-Item -ItemType Directory -Path $delivery -Force | Out-Null
$archivePath = Join-Path $delivery "FrameLab-$Version-source.zip"
if (Test-Path -LiteralPath $archivePath) { throw 'Source archive exists; preserve the existing delivery.' }
$files = [System.Collections.Generic.List[string]]::new()
foreach ($folder in @('src','public','scripts','docs','design-system','src-tauri/src','src-tauri/capabilities','src-tauri/icons','src-tauri/gen/android/app/src','src-tauri/gen/android/gradle')) {
  $path = Join-Path $root $folder
  if (Test-Path -LiteralPath $path) {
    Get-ChildItem -LiteralPath $path -Recurse -File | Where-Object { $_.FullName -notmatch '\\jniLibs\\|\.keystore$|\.jks$' } | ForEach-Object { $files.Add($_.FullName) }
  }
}
foreach ($folder in @('.', 'src-tauri', 'src-tauri/gen/android', 'src-tauri/gen/android/app')) {
  Get-ChildItem -LiteralPath (Join-Path $root $folder) -File | Where-Object { $_.Name -match '\.(json|toml|lock|ts|html|md|kts|properties)$|^gradlew(\.bat)?$|^build\.rs$' -and $_.Name -ne 'local.properties' } | ForEach-Object { $files.Add($_.FullName) }
}
$zip = [System.IO.Compression.ZipFile]::Open($archivePath, 'Create')
try {
  foreach ($file in ($files | Sort-Object -Unique)) {
    $relative = $file.Substring($root.Length + 1).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file, $relative, 'Optimal') | Out-Null
  }
} finally { $zip.Dispose() }
Get-FileHash -LiteralPath $archivePath -Algorithm SHA256
