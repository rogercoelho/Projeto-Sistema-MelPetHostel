const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TARGET_DIRS = ["Frontend", "frontend", "backend"];
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "uploads",
]);
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".css",
  ".html",
  ".json",
  ".md",
  ".sql",
  ".env",
  ".example",
  ".txt",
]);
const MOJIBAKE_PATTERN = /Ã£|Ã¡|Ã¢|Ã©|Ãª|Ã­|Ã³|Ã´|Ãµ|Ãº|Ã§|Â|�/;

function isTextFile(filePath) {
  const name = path.basename(filePath);
  if (name.startsWith(".env")) return true;
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && isTextFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

const findings = [];
const scannedRoots = new Set(
  TARGET_DIRS.map((dir) => path.join(ROOT, dir)).filter((dir) => fs.existsSync(dir)),
);

for (const rootDir of scannedRoots) {
  for (const filePath of walk(rootDir)) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (MOJIBAKE_PATTERN.test(line)) {
        findings.push({
          filePath: path.relative(ROOT, filePath),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
}

if (findings.length) {
  console.error("Mojibake encontrado. Corrija os textos antes de continuar:\n");
  for (const finding of findings) {
    console.error(`${finding.filePath}:${finding.line}: ${finding.text}`);
  }
  process.exit(1);
}

console.log("Nenhum mojibake encontrado.");
