/**
 * 统一的「北京时间」日期格式化工具。
 * 同时被构建期（Node）与浏览器客户端脚本使用，不依赖运行时所在时区。
 *
 * 重要区分：
 *  - 数据源返回的构建日期（nightly / msupdate / UUP）都是「北京时间墙钟」字符串
 *    （UUP 甚至自带 CST），应按字面量直接重新排版，不能做时区换算。
 *  - builtAt 是真正的 UTC 时间戳（ISO），需要把 UTC 瞬间换算成北京时间。
 */

/** 从各类日期串中提取 年/月/日/时/分 组件（纯正则，不依赖运行时时区解释） */
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

/**
 * 把「已是北京时间」的日期串统一格式化为「YYYY-MM-DD HH:MM」。
 * 适用于 nightly / msupdate / UUP 等数据源返回的构建日期。
 */
export function formatBeijing(s: string | undefined): string {
  const c = parseComponents(s ?? "");
  if (!c) return s ? String(s) : "—";
  return `${c.y}-${p(c.mo)}-${p(c.d)} ${p(c.h)}:${p(c.mi)}`;
}

/**
 * 把真正的 UTC 时间戳（如 builtAt）换算为北京时间「YYYY-MM-DD HH:MM」。
 * 与运行时所在时区无关。
 */
export function formatBeijingInstant(iso: string): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return String(iso || "—");
  // UTC 瞬间 → 北京时间(UTC+8)，跨运行时一致
  const bj = new Date(t.getTime() + (t.getTimezoneOffset() + 480) * 60000);
  return `${bj.getFullYear()}-${p(bj.getMonth() + 1)}-${p(bj.getDate())} ${p(bj.getHours())}:${p(bj.getMinutes())}`;
}

/** 供排序使用：把日期串转为可比较的时间戳（按组件，跨运行时一致） */
export function toBeijingMs(s: string | undefined): number {
  const c = parseComponents(s ?? "");
  if (!c) return 0;
  return Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi);
}
