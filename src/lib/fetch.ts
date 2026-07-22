/**
 * 构建时（Node）专用的健壮 HTTP 拉取模块。
 *
 * 该模块只在 Astro 构建 / 开发（服务端 Node）阶段被调用，
 * 用于替代原先「前端运行时拉取」的逻辑。它充分考虑了各种潜在失败：
 *   - 网络层错误（ECONNRESET / ETIMEDOUT / ENOTFOUND / EAI_AGAIN / DNS 失败等）
 *   - 请求超时（通过 AbortController 实现，默认 20s）
 *   - HTTP 非 2xx（429 限流、5xx 服务端错误会自动重试；其余默认不重试）
 *   - 空响应体（服务端偶发抖动，自动重试）
 *   - 响应体读取失败 / 压缩解码失败
 *   - TLS / 证书错误
 *   - JSON 解析失败（fetchJson 专用）
 *
 * 重试策略：指数退避 + 抖动，默认重试 4 次（共 5 次尝试）。
 */

export interface FetchOptions extends RequestInit {
  /** 重试次数（不含首次），默认 4 */
  retries?: number;
  /** 首次重试等待毫秒，指数退避基准，默认 700 */
  retryBaseDelay?: number;
  /** 单次请求超时毫秒，默认 20000 */
  timeout?: number;
  /** 是否对 4xx（除 429）也重试，默认 false */
  retryOnClientError?: boolean;
  /** 自定义 User-Agent，默认带一个合理的桌面浏览器 UA */
  userAgent?: string;
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly url?: string,
    public readonly status?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchResult {
  /** 跟随重定向后的最终地址 */
  url: string;
  status: number;
  ok: boolean;
  text: string;
  headers: Headers;
}

// 全局统一 User-Agent：所有对外（构建时）请求都使用它，便于数据源识别与白名单放行。
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 EEEOS-GET-Build";

function stripHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

/** 判断 HTTP 状态码是否值得重试 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** 判断异常是否值得重试（网络层 / 超时 / TLS 等） */
function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const patterns = [
    /fetch failed/i,
    /network error/i,
    /econnreset/i,
    /etimedout/i,
    /econnrefused/i,
    /enotfound/i,
    /eai_again/i,
    /socket hang up/i,
    /aborted/i,
    /timeout/i,
    /tls/i,
    /certificate/i,
    /bad gateway/i,
    /service unavailable/i,
    /unexpected end of (file|input)/i,
    /premature close/i,
    /decoding failed/i,
    /invalid chunk/i,
    /failed to fetch/i,
  ];
  return patterns.some((re) => re.test(msg));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backoff(
  attempt: number,
  base: number,
  reason: string,
  url: string,
  err: unknown
): Promise<void> {
  const delay = Math.min(base * Math.pow(2, attempt) + Math.floor(Math.random() * 250), 15000);
  const msg = err instanceof Error ? err.message : err ? String(err) : "";
  const tag = `[fetch] ${reason}（第 ${attempt + 1} 次重试）${url}`;
  console.warn(msg ? `${tag}：${msg} — ${delay}ms 后重试` : `${tag} — ${delay}ms 后重试`);
  await sleep(delay);
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (e) {
    throw new FetchError(`读取响应体失败：${(e as Error).message}`, e, res.url, res.status, true);
  }
}

/**
 * 核心方法：带重试地从指定 URL 拉取文本。
 * 仅在构建期（Node）使用，不会进入浏览器打包产物。
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const {
    retries = 4,
    retryBaseDelay = 700,
    timeout = 20000,
    retryOnClientError = false,
    userAgent = DEFAULT_UA,
    headers,
    ...rest
  } = opts;

  const finalHeaders: Record<string, string> = {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    ...stripHeaders(headers),
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      let res: Response;
      try {
        res = await fetch(url, { ...rest, headers: finalHeaders, signal: controller.signal });
      } catch (netErr) {
        lastErr = netErr;
        if (attempt < retries && isRetryableError(netErr)) {
          await backoff(attempt, retryBaseDelay, "网络错误", url, netErr);
          continue;
        }
        throw new FetchError(`请求失败且重试耗尽：${(netErr as Error).message}`, netErr, url);
      } finally {
        clearTimeout(timer);
      }

      const body = await readBody(res);

      if (!res.ok) {
        const retryable =
          isRetryableStatus(res.status) ||
          (retryOnClientError && res.status >= 400 && res.status < 500);
        if (attempt < retries && retryable) {
          await backoff(attempt, retryBaseDelay, `HTTP ${res.status}`, res.url || url, null);
          continue;
        }
        throw new FetchError(
          `HTTP ${res.status} ${res.statusText || ""}`.trim(),
          undefined,
          res.url || url,
          res.status
        );
      }

      if (body.trim() === "") {
        if (attempt < retries) {
          await backoff(attempt, retryBaseDelay, "空响应", res.url || url, null);
          continue;
        }
        // 末次仍为空：返回空文本，交由调用方决定（如 JSON 解析会失败）
      }

      return { url: res.url || url, status: res.status, ok: true, text: body, headers: res.headers };
    } catch (e) {
      if (e instanceof FetchError) throw e;
      lastErr = e;
      if (attempt < retries && isRetryableError(e)) {
        await backoff(attempt, retryBaseDelay, "异常", url, e);
        continue;
      }
      throw new FetchError(`请求异常：${(e as Error)?.message ?? String(e)}`, e, url);
    }
  }
  throw new FetchError("未知拉取错误（重试循环异常退出）", lastErr, url);
}

/** 拉取纯文本（HTML 等） */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text;
}

/** 拉取并解析 JSON，解析失败抛 FetchError */
export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  try {
    return JSON.parse(res.text) as T;
  } catch (e) {
    throw new FetchError(
      `JSON 解析失败：${(e as Error).message}（响应前 160 字符：${res.text.slice(0, 160)}）`,
      e,
      res.url,
      res.status
    );
  }
}
