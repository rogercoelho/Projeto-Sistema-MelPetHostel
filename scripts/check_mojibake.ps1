$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$patterns = "Ã£|Ã¡|Ã¢|Ã©|Ãª|Ã­|Ã³|Ã´|Ãµ|Ãº|Ã§|Â|�"
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
