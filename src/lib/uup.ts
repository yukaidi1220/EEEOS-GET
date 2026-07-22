/**
 * UUP 版本自动检测模块（构建时）。
 *
 * 数据源：https://uupdump.cn/known.php?q=category:<分类>
 * 该接口返回的是 HTML 表格（非 JSON），需要解析。
 * 解析失败时降级为「检测失败」，不影响主数据构建。
 */

import { fetchText, FetchError } from "./fetch";
import { formatBeijing } from "./format";
import { UUP_CATEGORIES } from "../config";
import type { UUPBuild, UUPGroup } from "./buildData";

const UUP_BASE = "https://uupdump.cn"; // 生成构建详情链接时用（用户浏览器侧打开）
// 镜像站列表：构建时依次尝试，任一可用即可，提升 CI 拉取稳定性（单点易被限流）
const UUP_MIRRORS = [
  "https://uupdump.cn",
  "https://uupdump.net",
  "https://uupdump.ts.sjtu.cn",
];

/** 去掉 HTML 标签并压缩空白 */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** 归一化架构：uupdump 可能返回 amd64 / arm64 / x86，统一为 x64 / arm64 / x86 */
function normalizeArch(a: string): string {
  const s = a.toLowerCase();
  if (/arm/.test(s)) return "arm64";
  if (/amd64|x64|64/.test(s)) return "x64";
  if (/x86|32/.test(s)) return "x86";
  return a;
}

/** 从一段 known.php 的 HTML 中解析出所有可用构建 */
export function parseBuildsFromHtml(html: string): UUPBuild[] {
  const builds: UUPBuild[] = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    if (/<th>/.test(row)) continue; // 跳过表头

    const idM =
      row.match(/selectlang\.php\?id=([0-9a-f-]+)/i) ||
      row.match(/update\.php\?id=([0-9a-f-]+)/i);
    const id = idM ? idM[1] : "";
    if (!id) continue;

    const titleM = row.match(/selectlang\.php\?id=[0-9a-f-]+">([\s\S]*?)<\/a>/i);
    const title = titleM ? stripHtml(titleM[1]) : "";
    if (!title) continue;

    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => stripHtml(x[1]));
    const arch = normalizeArch(tds[1] ?? "");
    const date = formatBeijing(tds[2]);

    const buildM = title.match(/\(([\d]+(?:\.\d+)*)\)/);
    const build = buildM ? buildM[1] : "";

    builds.push({
      id,
      title,
      build,
      arch,
      date,
      url: `${UUP_BASE}/selectlang.php?id=${id}`,
    });
  }
  return builds;
}

/** 检测分页（<div class="ui pagination menu"> 内带绝对地址的 known.php 链接），返回后续页绝对地址 */
function findPagination(html: string): string[] {
  const block = html.match(/<div class="ui pagination menu">([\s\S]*?)<\/div>/);
  if (!block) return [];
  const pages: string[] = [];
  const linkRe = /href=["'](https?:\/\/[^\s"']*known\.php\?[^"']+)["']/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(block[1]))) {
    pages.push(lm[1].replace(/&amp;/g, "&"));
  }
  return pages;
}

/** 检测单个分类下的所有 UUP 构建（含分页）。依次尝试各镜像站，任一成功即用 */
export async function detectUUP(category: string, label: string): Promise<UUPGroup> {
  const urlFor = (base: string) =>
    `${base}/known.php?q=${encodeURIComponent(`category:${category}`)}`;

  let rawHtml: string | null = null;
  let lastErr: unknown;
  for (const base of UUP_MIRRORS) {
    try {
      const html = await fetchText(urlFor(base), { timeout: 30000 });
      if (html && /<tr>/.test(html)) {
        rawHtml = html;
        break;
      }
      console.warn(`[uup][${category}][${base}] 响应中无表格，尝试下一个镜像`);
    } catch (e) {
      lastErr = e;
      console.warn(`[uup][${category}][${base}] 拉取失败：${(e as Error)?.message ?? e}，尝试下一个镜像`);
    }
  }

  if (!rawHtml) {
    const msg =
      lastErr instanceof FetchError
        ? `所有镜像均不可用（${lastErr.message}）`
        : (lastErr as Error)?.message ?? "所有 UUP 镜像均不可用";
    return { category, label, builds: [], error: msg };
  }

  try {
    let builds = parseBuildsFromHtml(rawHtml);

    const pages = findPagination(rawHtml);
    if (pages.length) {
      const others = await Promise.all(
        pages.map((p) =>
          fetchText(p, { timeout: 30000 })
            .then((t) => parseBuildsFromHtml(t))
            .catch(() => [] as UUPBuild[])
        )
      );
      for (const o of others) builds = builds.concat(o);
    }

    // 按 id 去重
    const seen = new Set<string>();
    builds = builds.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)));

    return { category, label, builds };
  } catch (e) {
    const msg = e instanceof FetchError ? `解析失败（${e.message}）` : (e as Error)?.message ?? String(e);
    return { category, label, builds: [], error: msg };
  }
}

/** 检测配置中全部分类的 UUP 构建（顺序执行，避免并发触发 uupdump 限流） */
export async function detectAllUUP(): Promise<UUPGroup[]> {
  const groups: UUPGroup[] = [];
  for (const c of UUP_CATEGORIES) {
    groups.push(await detectUUP(c.category, c.label));
    // 礼貌地错开请求，降低被限流概率
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return groups;
}
