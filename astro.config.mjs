import { defineConfig } from "astro/config";

// 静态站，可直接丢到任意静态托管 / OpenList 网页根目录。
// 若部署在子路径（如 /get/），把 base 改成 "/get/" 即可。
export default defineConfig({
  output: "static",
  base: "/",
  server: { host: true, port: 4321 },
  build: { outDir: "dist" },
});
