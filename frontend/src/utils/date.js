/**
 * Date utilities for the frontend.
 * Keep functions small and pure for reuse across components.
 */

/**
 * Format a Date or date-like value as DD/MM/YYYY.
 * Returns empty string for falsy values.
 *
 * @param {Date|string|null|number} value
 * @returns {string} formatted date like 04/02/2026
 */
export function formatDateDisplay(value) {
  if (!value && value !== 0) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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
  toISODate,
};
