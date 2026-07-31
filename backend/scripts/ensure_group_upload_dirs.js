#!/usr/bin/env node
require("dotenv").config();

const path = require("path");
const fs = require("fs").promises;
const db = require("../src/config/database");

function safeNameFor(name) {
  return String(name || "")
    .trim()
    .replace(/[\\/:?"[\]]|[<>|*]/g, "-")
    .replace(/\s+/g, " ");
}

async function ensureDir(dirPath) {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`${dirPath} existe, mas nao e um diretorio.`);
    }
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.mkdir(dirPath, { recursive: true });
    return true;
  }
}

async function main() {
  const uploadsRoot =
    process.env.UPLOADS_ROOT || path.resolve(__dirname, "../..", "uploads");

  console.log("Uploads root:", uploadsRoot);
  await ensureDir(uploadsRoot);

  try {
    const [groups] = await db.query(
      "SELECT id, Nome_Grupo FROM Grupos ORDER BY Nome_Grupo",
    );
    console.log(`Grupos encontrados: ${groups.length}`);

    for (const group of groups) {
      const safeName = safeNameFor(group.Nome_Grupo) || String(group.id);
      const groupDir = path.join(uploadsRoot, safeName);
      const createdGroupDir = await ensureDir(groupDir);

      console.log(
        `Grupo ${group.id} -> ${safeName}: pasta ${createdGroupDir ? "criada" : "ok"}`,
      );
    }
  } catch (error) {
    console.warn("Nao foi possivel verificar grupos:", error.message || error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }

  console.log("Concluido.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
