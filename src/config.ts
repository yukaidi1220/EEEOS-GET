// 数据契约 / 频道清单
//
// 本文件是唯一需要随构建改动的地方。
// 数据来自你的 OpenList（res.yukaidi.top）上构建流水线生成的元数据 JSON：
//   - 修改版 (Nightly)：  zhipin:/File/System/Nightly/<file>.json
//                         对外地址 ${base}/zhipin/System/Nightly/<file>.json
//   - 原版   (MSUpdate)： mupan:/File/System_MSUpdate/<os_ver>/<release>/latest_<arch>.json
//                         对外地址 ${base}/mupan/System_MSUpdate/<os_ver>/<release>/latest_<arch>.json
//
// 字段含义（与 makexrsys.ps1 / msupdate.ps1 生成的 JSON 对应）：
//   Nightly  JSON: sys{ ver, vercn, date, datefull, file, size, byte, md5, sha256, url }
//                 os { arch, ver, version, file, index }
//   MSUpdate JSON: name, size, date, hash{sha256,md5}, os_ver, os_display, os_version,
//                 os_rsversion, os_release, os_build, os_arch, os_lang, os_type,
//                 msupdate{ makeversion, makefrom, updatefromuup, ... }
//
// 分组与标签：
//   group 决定页面内的分组标题（如 “Windows 11 消费版”），尽量把同类系统归到一组；
//   tag   是卡片上的小标签（如 “专业版” / “企业版S”），用于一眼区分版本性质。
//
// 注意（CORS）：OpenList 直链 OneDrive 时会 302 跳到 SharePoint 下载地址，
// 跨域 fetch 可能被拦。推荐把本页部署在与数据同域（res.yukaidi.top）下，
// 或在 OpenList 后台开启 CORS；若必须跨域，可设 proxyUrl 走反代。

export interface NightlyChannel {
  /** latest 指针 JSON 文件名（不含 .json），如 EEEOS_Win11_26H1_Pro_x64_CN_Full_Net */
  file: string;
  /** 展示名（可选，缺省用 JSON 里的 sys.vercn 清洗后的值） */
  label?: string;
  /** 分组标题 */
  group?: string;
  /** 版本小标签，如 专业版 / 企业版S / 旗舰版 */
  tag?: string;
}

export interface MSUpdateChannel {
  os_ver: string; // 11 / 10 / 7 ...
  release: string; // 26H1 / LTSC2024 / LTSB2016 ...
  arch: string; // x64 / arm64 / x86
  label?: string;
  group?: string;
  tag?: string;
}

export const SITE = {
  /** OpenList 根，注意结尾无斜杠 */
  base: "https://res.yukaidi.top/d/gslb",
  title: "鹅鹅鹅系统 · 构建分发",
  subtitle: "修改版系统 & 原版集成更新系统 · 最新构建",
  /**
   * 可选：跨域反代前缀。设了之后所有元数据请求会先走它，
   * 例如 "https://my-proxy.workers.dev/?url="，由反代去拉 OpenList 并加 CORS。
   * 同域部署时保持空字符串。
   */
  proxyUrl: "",
  /** 取不到数据时展示的提示 */
  emptyHint: "该版本暂无可用构建",
};

// 修改版（鹅鹅鹅系统）：按 Windows 大版本 + 渠道分组
export const NIGHTLY: NightlyChannel[] = [
  // Windows 11 消费版
  { file: "EEEOS_Win11_26H1_Pro_x64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_26H1_Pro_ARM64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_25H2_Pro_x64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_25H2_Pro_ARM64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_24H2_Pro_x64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_23H2_Pro_x64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_23H2_Pro_ARM64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  { file: "EEEOS_Win11_21H2_Pro_x64_CN_Full_Net", group: "Windows 11 消费版", tag: "专业版" },
  // Windows 11 企业版 (LTSC)
  { file: "EEEOS_Win11_LTSC2024_EntS_x64_CN_Full_Net", group: "Windows 11 企业版 (LTSC)", tag: "企业版S" },
  { file: "EEEOS_Win11_LTSC2024_EntS_ARM64_CN_Full_Net", group: "Windows 11 企业版 (LTSC)", tag: "企业版S" },
  // Windows 10 消费版
  { file: "EEEOS_Win10_22H2_Pro_x64_CN_Full_Net", group: "Windows 10 消费版", tag: "专业版" },
  // Windows 10 企业版 (LTSC/LTSB)
  { file: "EEEOS_Win10_LTSC2021_EntS_x64_CN_Full_Net", group: "Windows 10 企业版 (LTSC/LTSB)", tag: "企业版S" },
  { file: "EEEOS_Win10_LTSC2019_EntS_x64_CN_Full_Net", group: "Windows 10 企业版 (LTSC/LTSB)", tag: "企业版S" },
  { file: "EEEOS_Win10_LTSB2016_EntS_x64_CN_Full_Net", group: "Windows 10 企业版 (LTSC/LTSB)", tag: "企业版S" },
  // Windows 7
  { file: "EEEOS_Win7_SP1_Ult_x64_CN_Full_Net", group: "Windows 7", tag: "旗舰版" },
];

// 原版（集成更新）：按 Windows 大版本 + 渠道分组
export const MSUPDATE: MSUpdateChannel[] = [
  // Windows 11 消费版
  { os_ver: "11", release: "26H1", arch: "x64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "26H1", arch: "arm64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "25H2", arch: "x64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "25H2", arch: "arm64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "24H2", arch: "x64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "23H2", arch: "x64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "23H2", arch: "arm64", group: "Windows 11 消费版" },
  { os_ver: "11", release: "21H2", arch: "x64", group: "Windows 11 消费版" },
  // Windows 11 企业版 (LTSC)
  { os_ver: "11", release: "LTSC2024", arch: "x64", group: "Windows 11 企业版 (LTSC)" },
  { os_ver: "11", release: "LTSC2024", arch: "arm64", group: "Windows 11 企业版 (LTSC)" },
  // Windows 10 消费版
  { os_ver: "10", release: "22H2", arch: "x64", group: "Windows 10 消费版" },
  { os_ver: "10", release: "22H2", arch: "arm64", group: "Windows 10 消费版" },
  // Windows 10 企业版 (LTSC/LTSB)
  { os_ver: "10", release: "LTSC2021", arch: "x64", group: "Windows 10 企业版 (LTSC/LTSB)" },
  { os_ver: "10", release: "LTSC2019", arch: "x64", group: "Windows 10 企业版 (LTSC/LTSB)" },
  { os_ver: "10", release: "LTSB2016", arch: "x64", group: "Windows 10 企业版 (LTSC/LTSB)" },
];

// UUP 版本自动检测的分类清单（对应 uupdump.cn 的 category 标识）。
// 构建时会逐个查询 known.php?q=category:<category>，解析出当前可用的 UUP 构建。
// 若某分类无构建或检测失败，页面会优雅降级（显示「暂无 / 检测失败」）。
export interface UUPCategory {
  /** uupdump 分类标识，如 w11-26h1 */
  category: string;
  /** 友好名称 */
  label: string;
}

export const UUP_CATEGORIES: UUPCategory[] = [
  { category: "w11-26h1", label: "Windows 11 26H1" },
  { category: "w11-25h2", label: "Windows 11 25H2" },
  { category: "w11-24h2", label: "Windows 11 24H2" },
  { category: "w11-23h2", label: "Windows 11 23H2" },
  { category: "w11-22h2", label: "Windows 11 22H2" },
  { category: "w11-21h2", label: "Windows 11 21H2" },
  { category: "w10-22h2", label: "Windows 10 22H2" },
];
