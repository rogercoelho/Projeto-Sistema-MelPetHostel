// Utility functions for file name handling
export function stripTrailingExtension(base, ext) {
  if (!base) return base;
  if (!ext) return base;
  const lowerBase = base.toLowerCase();
  const lowerExt = ext.toLowerCase();
  if (lowerBase.endsWith(`.${lowerExt}`)) {
    return base.slice(0, base.length - (lowerExt.length + 1));
  }
  return base;
}

export default {
  stripTrailingExtension,
};
