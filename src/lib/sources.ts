import { SITE, NIGHTLY, MSUPDATE, type NightlyChannel, type MSUpdateChannel } from "../config";
import { fetchWithRetry } from "./fetch";
import { formatSourceDate } from "./format";

/** 归一化后的统一卡片模型（前端只认这个） */
export interface BuildCard {
  type: "nightly" | "msupdate";
  name: string; // 展示名
  ver: string; // 版本标识（EEEOS_... 或 os_version）
  arch: string;
  osDisplay: string;
  osVersion: string; // 构建号
  date: string;
  sizeText: string;
  sizeBytes: number;
  sha256?: string;
  md5?: string;
  downloadUrl: string;
  note?: string;
}

export interface LoadResult {
  label: string;
  group: string;
  tag?: string;
  /** 架构标识（x64 / arm64 / x86），即使无构建也能据此筛选 */
  arch: string;
  card: BuildCard | null;
  error?: string;
  /** 关联到的 UUP 分类 slug（原版系统专用，用于和 UUP 最新版本比对） */
  uupCategory?: string;
  /** 由 buildData 在收集阶段填充：UUP 中比本构建更新的最新版本 */
  uupLatest?: { build: string; url?: string };
  /** 由 buildData 填充：本构建版本是否已落后于 UUP 最新版本 */
  outdated?: boolean;
}

/** 原版系统 (os_ver, release) → UUP 分类 slug 的映射（仅列出 uupdump 实际存在的分类） */
const MS_TO_UUP: Record<string, string> = {
  "11-26H1": "w11-26h1",
  "11-25H2": "w11-25h2",
  "11-24H2": "w11-24h2",
  "11-23H2": "w11-23h2",
  "11-21H2": "w11-21h2",
  "10-22H2": "w10-22h2",
  // 注：LTSC2024 / LTSC2021 / LTSC2019 / LTSB2016 在 uupdump 无对应分类（返回 400），暂无法比对
};

/** 从 Nightly 文件名推断架构，如 EEEOS_Win11_26H1_Pro_ARM64_CN_Full_Net → arm64 */
function archFromFile(file: string): string {
  if (/_ARM64_/i.test(file)) return "arm64";
  if (/_x86_/i.test(file)) return "x86";
  return "x64";
}

/** 对外元数据地址 */
export function nightlyUrl(file: string): string {
  return `${SITE.base}/zhipin/System/Nightly/${file}.json`;
}
export function msupdateUrl(ch: MSUpdateChannel): string {
  return `${SITE.base}/mupan/System_MSUpdate/${ch.os_ver}/${ch.release}/latest_${ch.arch}.json`;
}

async function fetchJson(url: string): Promise<any> {
  // 构建时（Node）拉取：直接请求源地址，不涉及浏览器 CORS；
  // 使用统一的健壮拉取模块（重试 / 超时 / 各类失败处理）。
  const res = await fetchWithRetry(url, { timeout: 30000 });
  try {
    return JSON.parse(res.text);
  } catch {
    throw new Error("JSON 解析失败");
  }
}

export function normalizeNightly(raw: any, ch: NightlyChannel): BuildCard {
  const sys = raw?.sys ?? {};
  const os = raw?.os ?? {};
  // 把 "鹅鹅鹅系统_Win11_26H1_专业_x64_完整_主板驱动" 清洗为 "Win11 26H1 专业 x64"
  const rawName = sys.vercn ?? ch.label ?? sys.ver ?? ch.file;
  const cleanName = rawName.replace(/^鹅鹅鹅系统_/, "").split("_").slice(0, 4).join(" ");
  return {
    type: "nightly",
    name: cleanName || rawName,
    ver: sys.ver ?? ch.file,
    arch: os.arch ?? "",
    osDisplay: os.ver ? `鹅鹅鹅系统 Win${os.ver}` : "鹅鹅鹅系统",
    osVersion: os.version ?? "",
    date: formatSourceDate(sys.datefull ?? sys.date),
    sizeText: sys.size ?? "",
    sizeBytes: Number(sys.byte) || 0,
    sha256: sys.sha256,
    md5: sys.md5,
    downloadUrl: sys.url ?? "",
    note: os.index ? `镜像索引 #${os.index}` : undefined,
  };
}

export function normalizeMSUpdate(raw: any, ch: MSUpdateChannel): BuildCard {
  const h = raw?.hash ?? {};
  const dl = `${SITE.base}/mupan/System_MSUpdate/${ch.os_ver}/${ch.release}/${raw.os_version}/${raw.name}`;
  return {
    type: "msupdate",
    name: raw.os_display ?? ch.label ?? raw.name,
    ver: raw.os_version ?? "",
    arch: raw.os_arch ?? ch.arch,
    osDisplay: raw.os_display ?? "",
    osVersion: raw.os_version ?? "",
    date: formatSourceDate(raw.date),
    sizeText: formatBytes(Number(raw.size) || 0),
    sizeBytes: Number(raw.size) || 0,
    sha256: h.sha256,
    md5: h.md5,
    downloadUrl: dl,
    note: raw.os_edition ? `版本: ${raw.os_edition}` : undefined,
  };
}

export async function loadNightly(): Promise<LoadResult[]> {
  return Promise.all(
    NIGHTLY.map(async (ch): Promise<LoadResult> => {
      const label = ch.label ?? ch.file;
      const arch = archFromFile(ch.file);
      try {
        const raw = await fetchJson(nightlyUrl(ch.file));
        return { label, group: ch.group ?? "其他", tag: ch.tag, arch, card: normalizeNightly(raw, ch) };
      } catch (e) {
        return { label, group: ch.group ?? "其他", tag: ch.tag, arch, card: null, error: String(e) };
      }
    })
  );
}

export async function loadMSUpdate(): Promise<LoadResult[]> {
  return Promise.all(
    MSUPDATE.map(async (ch): Promise<LoadResult> => {
      const label = ch.label ?? `${ch.os_ver} ${ch.release} ${ch.arch}`;
      const arch = ch.arch.toLowerCase();
      try {
        const raw = await fetchJson(msupdateUrl(ch));
        return {
          label,
          group: ch.group ?? "其他",
          tag: ch.tag,
          arch,
          uupCategory: MS_TO_UUP[`${ch.os_ver}-${ch.release}`],
          card: normalizeMSUpdate(raw, ch),
        };
      } catch (e) {
        return { label, group: ch.group ?? "其他", tag: ch.tag, arch, card: null, error: String(e) };
      }
    })
  );
}

/** 字节数 → 人类可读 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}
