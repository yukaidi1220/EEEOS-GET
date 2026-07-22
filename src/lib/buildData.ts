/**
 * 构建时数据编排：统一收集「修改版系统 / 原版系统 / UUP 版本」三类数据。
 * 仅在 Astro 构建（或开发请求）的服务端阶段调用，结果会直接写入页面。
 */

import { loadNightly, loadMSUpdate, type LoadResult } from "./sources";
import { detectAllUUP } from "./uup";

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

export async function collectData(): Promise<SiteData> {
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

/** 判断是否为真正的 Windows 操作系统构建（排除 .NET Framework / OOBE 等非系统版本更新） */
export function isOsBuild(b: UUPBuild): boolean {
  const t = b.title.toLowerCase();
  return !t.includes(".net framework") && !t.includes("oobe");
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
