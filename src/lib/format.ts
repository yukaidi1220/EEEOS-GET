/**
 * 统一的「北京时间」日期格式化工具。
 * 同时被构建期（Node）与浏览器客户端脚本使用，不依赖运行时所在时区。
 *
 * 各数据源的时区约定并不一致，必须按「自带时区偏移」来换算：
 *  - 修改版 (Nightly)：sys.datefull = "2026-06-14T15:28:10.8917677+08:00"（已是北京时间）
 *  - 原版   (MSUpdate)：date = "2026-07-21T08:13:34.4958374+00:00"（这是 UTC，需 +8）
 *  - UUP：自带 CST（北京时间），按字面量排版
 * 做法：凡字符串带时区偏移（±HH:MM / Z），就按真实 UTC 瞬间换算 +8h 得到北京时间；
 *       否则当「已是北京时间」的字面量直接排版。这样两种源都不会差 8 小时。
 */

/** 从各类「无时区」日期串中提取 年/月/日/时/分 组件（纯正则） */
function parseComponents(s: string): { y: number; mo: number; d: number; h: number; mi: number } | null {
  if (!s) return null;
  const str = String(s).trim();
  // 兼容 2026-07-22 / 2026.07.22 / 2025-05-20 13:20:28 / ... 等
  const m = str.match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (!m) return null;
  return {
    y: +m[1],
    mo: +m[2],
    d: +m[3],
    h: m[4] != null ? +m[4] : 0,
    mi: m[5] != null ? +m[5] : 0,
  };
}

const p = (n: number) => String(n).padStart(2, "0");

/** 判断是否带时区偏移（±HH:MM / ±HHMM / Z），如 2026-07-21T08:13:34+00:00 */
function hasTzOffset(s: string): boolean {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(s.trim());
}

/** UTC 瞬间（含偏移的 ISO）→ 北京时间「YYYY-MM-DD HH:MM」，跨运行时一致 */
function isoToBeijing(iso: string): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return String(iso || "—");
  // 推到北京时间(UTC+8)后，用 UTC getter 读取，彻底不依赖运行时所在时区
  const bj = new Date(t.getTime() + 8 * 3600 * 1000);
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
}

/**
 * 数据源构建日期 → 北京时间「YYYY-MM-DD HH:MM」。
 * 带时区偏移的按真实 UTC 换算 +8h；其余（如纯日期 2026.06.14）按字面量排版。
 * 适用于 nightly / msupdate / UUP。
 */
export function formatSourceDate(s: string | undefined): string {
  if (!s) return "—";
  const str = String(s).trim();
  if (hasTzOffset(str)) return isoToBeijing(str);
  // 无偏移：当「已是北京时间」的字面量
  const c = parseComponents(str);
  if (!c) return str;
  return `${c.y}-${p(c.mo)}-${p(c.d)} ${p(c.h)}:${p(c.mi)}`;
}

/**
 * 把真正的 UTC 时间戳（如 builtAt）换算为北京时间「YYYY-MM-DD HH:MM」。
 * 与运行时所在时区无关。
 */
export function formatBeijingInstant(iso: string): string {
  return isoToBeijing(iso);
}

/** 供排序使用：转为可比较的时间戳（同样尊重时区偏移，与展示保持一致） */
export function toBeijingMs(s: string | undefined): number {
  if (!s) return 0;
  const str = String(s).trim();
  if (hasTzOffset(str)) {
    const t = new Date(str);
    if (!isNaN(t.getTime())) return t.getTime() + 8 * 3600 * 1000;
  }
  const c = parseComponents(str);
  if (!c) return 0;
  return Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi);
}
