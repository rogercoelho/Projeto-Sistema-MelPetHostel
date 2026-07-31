const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { sanitizePart } = require("./uploadsUtils");
const db = require("../config/database");

const uploadsRoot =
  process.env.UPLOADS_ROOT || path.resolve(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      const raw = req.body?.pastaConta || req.headers["pasta-conta"] || "";

      // Prefer a human-readable group name when available so folders use
      // /uploads/<grupo_nome>/... instead of numeric IDs.
      let userGrupoName =
        (req.user && (req.user.grupoNome || req.user.grupoName)) || null;
      const rawUserGrupo = (req.user && req.user.grupo) || "";
      // If no resolved group name but user.grupo looks like an ID, try to look it up
      if (
        !userGrupoName &&
        rawUserGrupo &&
        /^\d+$/.test(String(rawUserGrupo))
      ) {
        try {
          const gid = Number(rawUserGrupo);
          const [grows] = await db.query(
            "SELECT Nome_Grupo FROM Grupos WHERE id = ? LIMIT 1",
            [gid],
          );
          if (grows && grows.length && grows[0].Nome_Grupo) {
            userGrupoName = grows[0].Nome_Grupo;
          }
        } catch {
          // ignore DB lookup errors and continue using raw value
        }
      }

      const userGrupo = userGrupoName || rawUserGrupo || "";

      const groupParts = sanitizePart(userGrupo);
      const rawParts = sanitizePart(raw);

      let parts = [];
      if (groupParts.length) {
        if (rawParts.length && rawParts[0] === groupParts[0]) {
          parts = rawParts;
        } else {
          parts = [...groupParts, ...rawParts];
        }
      } else {
        parts = rawParts;
      }

      const dest = parts.length
        ? path.join(uploadsRoot, ...parts)
        : uploadsRoot;

      await fs.mkdir(dest, { recursive: true });

      cb(null, dest);
    } catch (err) {
      cb(err);
    }
  },

  filename: function (req, file, cb) {
    const base = (req.body?.nomeArquivo || file.originalname)
      .replace(/[/\\:?"<>|*]/g, "-")
      .trim();

    const ext = path.extname(file.originalname);

    cb(null, `${base}${ext}`);
  },
});

module.exports = multer({ storage });
