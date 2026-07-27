// prefer request-scoped connection (middleware in app.js sets req.db)
const db = require("../config/database");

function dbFor(req) {
  return req && req.db ? req.db : db;
}

module.exports = dbFor;
