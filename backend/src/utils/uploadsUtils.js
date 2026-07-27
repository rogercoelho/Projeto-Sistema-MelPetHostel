const fs = require("fs").promises;
const path = require("path");

function sanitizePart(s) {
  if (!s) return [];
  return String(s)
    .trim()
    .replace(/\s*>\s*/g, ">")
    .split(/[>\\/]+/)
    .map((p) =>
      p
        .trim()
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/^\.+/, "")
        .replace(/\.+$/, ""),
    )
    .filter(Boolean);
}

// Helper: recursively build folders tree under uploads root
async function buildUploadsTree(baseDir, rel = "") {
  const full = path.join(baseDir, rel);
  const out = [];

  try {
    const entries = await fs.readdir(full, { withFileTypes: true });

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const name = ent.name;
        const childRel = path.join(rel, name);

        const children = await buildUploadsTree(baseDir, childRel);

        out.push({
          name,
          path: childRel.replace(/\\\\/g, "/"),
          children,
        });
      }
    }
  } catch {}

  return out;
}

module.exports = {
  sanitizePart,
  buildUploadsTree,
};
