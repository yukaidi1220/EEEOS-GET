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

  return {
    nightly,
    msupdate,
    uup,
    builtAt: new Date().toISOString(),
  };
}
