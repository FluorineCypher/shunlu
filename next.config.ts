import type { NextConfig } from "next";

// output: "standalone" 在 Windows + pnpm 下需要 fs.symlink（node_modules 是 junction），
// 未开启「开发者模式」或非管理员时 `next build` 的 traced-copy 会 EPERM 失败。
// 本机演示走 `next start`（不依赖 standalone），故默认关闭；需要 standalone 产物时：
//   NEXT_OUTPUT_STANDALONE=1 pnpm build
// Vercel 自带构建流程，忽略此项。
const standalone =
  process.env.NEXT_OUTPUT_STANDALONE === "1" || process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  output: standalone ? "standalone" : undefined,
  transpilePackages: ["antd-mobile"],
};

export default nextConfig;
