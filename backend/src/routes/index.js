const express = require("express");
const router = express.Router();

// Keep this file focused on root-level routes (health, root info).
// Module routes (e.g. `/melpethostel`) are mounted in `app.js` to
// keep module wiring explicit and avoid double-mounting.

// root api
router.get("/", (req, res) => {
  res.json({ status: "ok", api: "sistema-melpethostel-api" });
});

// health
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

module.exports = router;
