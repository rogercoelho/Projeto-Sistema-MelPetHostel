const express = require("express");
const router = express.Router();

router.use("/telegram", require("./telegram"));
router.use(require("./contratos"));
router.use(require("./pets"));
router.use(require("./documentos"));
router.use(require("./planos"));
router.use(require("./hospedagens"));
router.use(require("./admin"));

module.exports = router;
