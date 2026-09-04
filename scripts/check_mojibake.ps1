$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$tokens = @(
  ([string][char]0x00C3 + [string][char]0x00A1),
  ([string][char]0x00C3 + [string][char]0x00A2),
  ([string][char]0x00C3 + [string][char]0x00A3),
  ([string][char]0x00C3 + [string][char]0x00A7),
  ([string][char]0x00C3 + [string][char]0x00A9),
  ([string][char]0x00C3 + [string][char]0x00AA),
  ([string][char]0x00C3 + [string][char]0x00AD),
  ([string][char]0x00C3 + [string][char]0x00B3),
  ([string][char]0x00C3 + [string][char]0x00B4),
  ([string][char]0x00C3 + [string][char]0x00B5),
  ([string][char]0x00C3 + [string][char]0x00BA),
  ([string][char]0x00C2),
  ([string][char]0xFFFD)
)
$patterns = ($tokens | ForEach-Object { [regex]::Escape($_) }) -join "|"
$extensions = @("*.js", "*.jsx", "*.css", "*.html", "*.json", "*.md", "*.sql", "*.env", "*.txt")
$excludeDirs = @("\node_modules\", "\dist\", "\build\", "\coverage\", "\uploads\", "\.git\")
$findings = New-Object System.Collections.Generic.List[string]

foreach ($extension in $extensions) {
  Get-ChildItem -Path $root -Recurse -File -Filter $extension | ForEach-Object {
    $file = $_.FullName
    foreach ($dir in $excludeDirs) {
      if ($file.Contains($dir)) {
        return
      }
    }

    $matches = Select-String -Path $file -Pattern $patterns -Encoding UTF8
    foreach ($match in $matches) {
      $relative = Resolve-Path -Path $file -Relative
      $findings.Add("${relative}:$($match.LineNumber): $($match.Line.Trim())")
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Error ("Mojibake encontrado:`n" + ($findings -join "`n"))
  exit 1
}

Write-Output "Nenhum mojibake encontrado."
