export function sanitizePresetName(name) {
  return (name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

export function sortPresetEntries(store) {
  return Object.entries(store || {}).sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
}
