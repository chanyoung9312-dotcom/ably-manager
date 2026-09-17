export const text = (value) => String(value ?? "").trim();
export function seoulDate(now = new Date()) {
  return new Date(new Date(now).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
}
export function dateKey(value) {
  const s = text(value);
  if (/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(+d) ? "" : seoulDate(d);
  }
  let m = s.match(/^(20\d{2})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})(?:\D|$)/);
  if (!m && /^20\d{6}$/.test(s))
    m = [s, s.slice(0, 4), s.slice(4, 6), s.slice(6, 8)];
  if (!m && /^2\d{5}$/.test(s))
    m = [s, `20${s.slice(0, 2)}`, s.slice(2, 4), s.slice(4, 6)];
  if (!m) return "";
  const key = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === key ? key : "";
}
export const shiftDay = (day, n) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const dayDistance = (a, b) =>
  (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
export const inWindow = (day, end, length, offset = 0) =>
  !!day &&
  day >= shiftDay(end, -offset - length + 1) &&
  day <= shiftDay(end, -offset);
export function numberOrNull(value) {
  const s = text(value).replace(/[,₩원\s]/g, "");
  if (!s || !/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const identifier = (v) => {
  const s = text(v);
  return /^\d{1,3}(?:,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s;
};
