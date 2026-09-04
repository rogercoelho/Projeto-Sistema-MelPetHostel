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
const MOJIBAKE_TOKENS = [
  "\u00c3\u00a1",
  "\u00c3\u00a2",
  "\u00c3\u00a3",
  "\u00c3\u00a7",
  "\u00c3\u00a9",
  "\u00c3\u00aa",
  "\u00c3\u00ad",
  "\u00c3\u00b3",
  "\u00c3\u00b4",
  "\u00c3\u00b5",
  "\u00c3\u00ba",
  "\u00c2",
  "\ufffd",
];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MOJIBAKE_PATTERN = new RegExp(
  MOJIBAKE_TOKENS.map(escapeRegex).join("|"),
);

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

for (const target of TARGET_DIRS) {
  const targetPath = path.join(ROOT, target);
  for (const filePath of walk(targetPath)) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (MOJIBAKE_PATTERN.test(line)) {
        findings.push(
          `${path.relative(ROOT, filePath)}:${index + 1}: ${line.trim()}`,
        );
      }
    });
  }
}

if (findings.length) {
  console.error("Mojibake encontrado:\n" + findings.join("\n"));
  process.exit(1);
}

console.log("Nenhum mojibake encontrado.");
