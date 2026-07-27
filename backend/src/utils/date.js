// Utility date helpers for the API
const { DateTime } = require("luxon");

function extractDayOfMonth(val) {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") {
    const n = Math.trunc(val);
    if (n >= 1 && n <= 31) return n;
    return null;
  }
  if (val instanceof Date) {
    const d = val.getDate();
    return d >= 1 && d <= 31 ? d : null;
  }
  const s = String(val).trim();
  if (/^\d{1,2}$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 31 ? n : null;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const day = Number(iso[3]);
    return day >= 1 && day <= 31 ? day : null;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed)) return parsed.getDate();
  return null;
}

function resolveTimezone(timezone, fallback = "America/Sao_Paulo") {
  const value = String(timezone || "").trim();
  if (value && DateTime.now().setZone(value).isValid) return value;
  return fallback;
}

function formatMysqlDateTime(dateTime) {
  return dateTime.toFormat("yyyy-MM-dd HH:mm:ss");
}

function nowMysqlDateTime(timezone, fallback = "America/Sao_Paulo") {
  return formatMysqlDateTime(
    DateTime.now().setZone(resolveTimezone(timezone, fallback)),
  );
}

function parseMysqlDateTimeInZone(
  value,
  timezone,
  fallback = "America/Sao_Paulo",
) {
  if (!value) return null;

  const zone = resolveTimezone(timezone, fallback);

  if (value instanceof Date && !isNaN(value)) {
    return DateTime.fromObject(
      {
        year: value.getFullYear(),
        month: value.getMonth() + 1,
        day: value.getDate(),
        hour: value.getHours(),
        minute: value.getMinutes(),
        second: value.getSeconds(),
      },
      { zone },
    );
  }

  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (match) {
    return DateTime.fromObject(
      {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4] || 0),
        minute: Number(match[5] || 0),
        second: Number(match[6] || 0),
      },
      { zone },
    );
  }

  const parsed = DateTime.fromISO(text, { zone });
  return parsed.isValid ? parsed : null;
}

module.exports = {
  extractDayOfMonth,
  formatMysqlDateTime,
  nowMysqlDateTime,
  parseMysqlDateTimeInZone,
  resolveTimezone,
};
