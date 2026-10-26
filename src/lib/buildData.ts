/**
 * 构建时数据编排：统一收集「修改版系统 / 原版系统 / UUP 版本」三类数据。
 * 仅在 Astro 构建（或开发请求）的服务端阶段调用，结果会直接写入页面。
 */

import { loadNightly, loadMSUpdate, type LoadResult } from "./sources";
import { detectAllUUP } from "./uup";
import { fetchWithRetry } from "./fetch";

export interface UUPBuild {
  /** uupdump 构建 UUID */
  id: string;
  /** 完整标题，如 "Windows 11, version 26H1 (28000.2525) amd64" */
  title: string;
  /** 解析出的内部版本号，如 "28000.2525" */
  build: string;
  /** 架构，如 "x64" / "arm64" */
  arch: string;
  /** 添加日期（原始字符串） */
  date: string;
  /** 跳转地址 */
  url: string;
}

export interface UUPGroup {
  /** uupdump 分类标识，如 "w11-26h1" */
  category: string;
  /** 友好名称 */
  label: string;
  builds: UUPBuild[];
  /** 检测失败时的错误信息 */
  error?: string;
}

export interface SiteData {
  nightly: LoadResult[];
  msupdate: LoadResult[];
  uup: UUPGroup[];
  /** 构建完成时间（ISO 字符串） */
  builtAt: string;
}

/** 模块级缓存：多页面（index/videos）共享同一次构建期拉取，避免 UUP 探测链路翻倍 */
let _cache: Promise<SiteData> | null = null;

export async function collectData(): Promise<SiteData> {
  return (_cache ??= collectDataUncached());
}

async function collectDataUncached(): Promise<SiteData> {
  const [nightly, msupdate, uup] = await Promise.all([
    loadNightly().catch((e) => {
      console.error("[build] nightly 加载失败：", e);
      return [] as LoadResult[];
    }),
    loadMSUpdate().catch((e) => {
      console.error("[build] msupdate 加载失败：", e);
      return [] as LoadResult[];
    }),
    detectAllUUP().catch((e) => {
      console.error("[build] UUP 检测失败：", e);
      return [] as UUPGroup[];
    }),
  ]);

  // 测试视频存在性校验：指针里的 sys.video 是 maker 构建时预先写死的，
  // 但视频要等 boot-test 跑完才上传——构建早于测试完成时该链接必然 404。
  // 构建期逐个探测，只保留真实存在的，避免前端出现死链按钮。
  // 注意两点：
  //   1) OpenList 不支持 HEAD（对已存在文件也返回 404），必须用 GET + Range 取首字节；
  //   2) fetchWithRetry 对 404 会抛 FetchError（非 2xx 视为失败），所以"抛异常=不存在"。
  await Promise.all(
    nightly.map(async (r) => {
      const u = r.card?.videoUrl;
      if (!u || !r.card) return;
      try {
        // 跟随重定向：OpenList 302 → Cloudreve 签名直链 → 200。
        // 存在=成功返回；不存在=404 抛 FetchError → 走 catch 隐藏。
        await fetchWithRetry(u, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          retries: 0, // 探测不重试，避免拖慢构建
          timeout: 15000,
        });
      } catch (e) {
        console.warn(`[build] 视频不存在或不可访问，隐藏：${u}（${(e as Error)?.message ?? e}）`);
        r.card.videoUrl = undefined;
      }
    })
  );

  // 原版系统 ↔ UUP 最新版本比对：
  // 若 UUP 同一分类（同架构优先）中存在比本构建更大的构建号，说明原版系统版本已落后，标记 outdated。
  const uupByCat = new Map(uup.map((g) => [g.category, g]));
  for (const r of msupdate) {
    if (!r.uupCategory || !r.card) continue;
    const grp = uupByCat.get(r.uupCategory);
    if (!grp || grp.builds.length === 0) continue;
    // 仅以真正的 Windows 操作系统构建参与比对：
    // 排除 .NET Framework / OOBE 等更新（它们虽带 28000.x 编号，但并非 Windows 版本本体，
    // 例如 28000.9340 实为 .NET Framework 安全更新，并非 26H1 系统构建）
    const osBuilds = grp.builds.filter(isOsBuild);
    if (osBuilds.length === 0) continue;
    const sameArch = osBuilds.filter((b) => b.arch === r.arch);
    const pool = sameArch.length ? sameArch : osBuilds;
    const latest = pool.reduce((m, b) => (cmpBuild(b.build, m.build) > 0 ? b : m), pool[0]);
    if (cmpBuild(latest.build, r.card.osVersion) > 0) {
      r.outdated = true;
      r.uupLatest = { build: latest.build, url: latest.url };
    }
  }

  return {
    nightly,
    msupdate,
    uup,
    builtAt: new Date().toISOString(),
  };
}

/** 判断是否为真正的 Windows 操作系统「版本」构建（如 "Windows 11, version 26H1 (28000.2525)"）。
 *  uupdump 分类页混有大量「刷版本号」的更新包（revision 上跳而已，并非完整系统构建），实测确认的形态：
 *  - "Cumulative Update for Windows 10 Version 22H2 (19045.7807) amd64" —— 月度累积更新，
 *    2026-10 实测它比同号的 Feature update 更晚上架，会赢得「最新版」比对并把链接指到 CU 下载页
 *  - "Cumulative Update Preview for Windows 11 Version 22H2 (...)" —— 注意词序是 "Update Preview"，
 *    单靠 "preview update" 关键字挡不住
 *  - "Update for Windows 11 (26200.8894) amd64" —— 零星热修
 *  - "Cumulative Update for Windows CPC OS (10.0.26200.9711) (26200.9711) amd64" —— CPC OS 累积更新
 *  以及既有的 .NET Framework / OOBE / Preview Update / Security Update / Servicing Stack 等已知噪音。
 *  而完整系统构建的标题实测只会以 "Windows <数字>"（如 "Windows 11, version 26H1"、"Windows 11 (22000.3260)"、
 *  "Windows 11 24H2 with Update (26100.1742)"、Insider Preview 构建）或 "Feature update ..."
 *  （如 "Feature update to Windows 10, version 22H2"，注意 "Feature update for Windows CPC OS"
 *  这类同号镜像条目也是完整系统构建）开头，
 *  故采用「黑名单关键字 + 白名单开头」双重过滤，兜住未来未知命名的更新包。 */
export function isOsBuild(b: UUPBuild): boolean {
  const t = b.title.toLowerCase();
  // 黑名单：确认为更新包（非系统本体）的标题关键字。
  // 注意不能用 "update for windows" 这种子串：会误伤 "Feature update for Windows CPC OS"（真实系统构建）。
  if (
    t.includes(".net framework") ||
    t.includes("oobe") ||
    t.includes("preview update") ||
    t.includes("security update") ||
    t.includes("cumulative update")
  ) {
    return false;
  }
  // 白名单："Update for Windows ..." / "Servicing/Setup/Dynamic ... Update ..." 等更新包
  // 都不以这两种形态开头，在这里被挡掉
  return /^windows \d+/.test(t) || /^feature update/.test(t);
}

/** 按「点分数字」比较两个构建号（如 28000.2525 vs 28000.9340），返回 -1/0/1 */
function cmpBuild(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}
