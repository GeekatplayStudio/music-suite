/** A reviewable timing draft; line weight follows word count rather than assuming equal lines. */
export function timestampLyrics(text: string, duration: number): string {
  const lines = text.split(/\r?\n/).map(line => line.replace(/^\[\d+:\d+(?:\.\d+)?\]\s*/, "").trim())
    .filter(line => line && !/^\[[^\]]+\]$/.test(line));
  const weights = lines.map(line => Math.max(1, line.split(/\s+/).length));
  const total = weights.reduce((sum, value) => sum + value, 0);
  const available = Math.max(1, duration - 8);
  let elapsed = 0;
  return lines.map((line, index) => {
    const seconds = 2 + available * elapsed / total;
    elapsed += weights[index];
    const hundredths = Math.round(seconds * 100);
    const minutes = Math.floor(hundredths / 6000);
    const remainder = hundredths % 6000;
    return `[${String(minutes).padStart(2, "0")}:${String(Math.floor(remainder / 100)).padStart(2, "0")}.${String(remainder % 100).padStart(2, "0")}]${line}`;
  }).join("\n");
}
