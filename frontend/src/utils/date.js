/**
 * Date utilities for the frontend.
 * Keep functions small and pure for reuse across components.
 */

export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MYSQL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/i;

function normalizeDateTimeToUtcInput(value) {
  if (value instanceof Date) return value;

  const text = String(value || "").trim();
  const match = text.match(MYSQL_DATE_TIME_PATTERN);
  if (!match) return text;

  const [, year, month, day, hour, minute, second = "00", fraction, offset] =
    match;
  const milliseconds = String(fraction || "000").padEnd(3, "0").slice(0, 3);
  const timezone = offset
    ? offset.replace(/^([+-]\d{2})(\d{2})$/, "$1:$2")
    : "Z";

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}${timezone}`;
}

/**
 * Format a Date or date-like value as DD/MM/YYYY.
 * Returns empty string for falsy values.
 *
 * @param {Date|string|null|number} value
 * @returns {string} formatted date like 04/02/2026
 */
export function formatDateDisplay(value) {
  if (!value && value !== 0) return "";

  const text = String(value || "").trim();
  const dateOnly = text.match(DATE_ONLY_PATTERN);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const normalized = normalizeDateTimeToUtcInput(value);
  const d = normalized instanceof Date ? normalized : new Date(normalized);
  if (isNaN(d)) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(d);
}

/**
 * Format a Date or MySQL/ISO datetime as DD/MM/YYYY, HH:mm in Sao Paulo.
 * MySQL DATETIME values without timezone are treated as UTC, matching the API
 * connection timezone and avoiding browser local timezone ambiguity.
 *
 * @param {Date|string|null|number} value
 * @returns {string}
 */
export function formatDateTimeSaoPaulo(value) {
  if (!value && value !== 0) return "-";
  const normalized = normalizeDateTimeToUtcInput(value);
  const d = normalized instanceof Date ? normalized : new Date(normalized);
  if (isNaN(d)) return String(value);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: SAO_PAULO_TIME_ZONE,
  }).format(d);
}

/**
 * Convert a Date or date-like value to an ISO date string YYYY-MM-DD.
 * Returns empty string for invalid values.
 *
 * @param {Date|string|number} value
 * @returns {string}
 */
export function toISODate(value) {
  if (!value && value !== 0) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

export default {
  formatDateDisplay,
  formatDateTimeSaoPaulo,
  toISODate,
};
