// 构建守卫：astro build 只允许在 CI / GitHub Actions 中运行，禁止本地构建。
// 本地预览请使用 `npm run dev`（开发模式下数据仍会在请求时实时拉取）。
const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

if (!isCI) {
  console.error("\n❌ 构建被拒绝：astro build 只允许在 CI / GitHub Actions 中运行。");
  console.error("   本地预览请使用 `npm run dev`（数据在请求时实时拉取，无需构建）。\n");
  process.exit(1);
}

console.log("✅ 检测到 CI 环境，允许构建。");
