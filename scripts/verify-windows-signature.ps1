param(
  [string[]]$Path = @()
)

$ErrorActionPreference = 'Stop'

Import-Module Microsoft.PowerShell.Security -ErrorAction Stop

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$targets = @()

if ($Path.Count -eq 0) {
  $distDir = Join-Path $repoRoot 'dist'
  $installer = Get-ChildItem -LiteralPath $distDir -Filter '*.exe' -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'MyCinema Setup *.exe' -or $_.Name -like 'MyCinema-Setup-*.exe' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  $appExe = Join-Path $repoRoot 'dist\win-unpacked\MyCinema.exe'

  if ($installer) {
    $targets += $installer.FullName
  }

  if (Test-Path -LiteralPath $appExe) {
    $targets += $appExe
  }
} else {
  foreach ($item in $Path) {
    if ([System.IO.Path]::IsPathRooted($item)) {
      $targets += (Resolve-Path -LiteralPath $item).Path
    } else {
      $targets += (Resolve-Path -LiteralPath (Join-Path $repoRoot $item)).Path
    }
  }
}

if ($targets.Count -eq 0) {
  throw 'No Windows executable artifacts were found to verify.'
}

$hasInvalidSignature = $false

foreach ($target in $targets) {
  $signature = Get-AuthenticodeSignature -LiteralPath $target
  $publisher = if ($signature.SignerCertificate) {
    $signature.SignerCertificate.Subject
  } else {
    'Unknown'
  }

  Write-Host "$($signature.Status): $target"
  Write-Host "  Publisher: $publisher"

  if ($signature.Status -ne 'Valid') {
    $hasInvalidSignature = $true
  }
}

if ($hasInvalidSignature) {
  throw 'One or more Windows artifacts are not validly signed.'
}
