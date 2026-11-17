import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";
import "antd-mobile/es/global";
import "./globals.css";
import AppShell from "@/components/AppShell";
import AntdMobileReact19Compat from "@/components/AntdMobileReact19Compat";
import PaintingSplash from "@/components/PaintingSplash";

const displayFont = localFont({
  src: [
    { path: "./fonts/instrument-serif-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-italic-400.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-display",
  display: "swap",
  preload: false,
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const monoFont = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "顺路",
  description: "校园顺路跑腿 Demo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

/**
 * v1.29 · 这里原来写死 `export const dynamic = "force-dynamic"`，
 * 一行就把整站所有页面降级成「每次导航都回源渲染」，正是首屏 0.6–1.0s 的根源。
 * 现在页面全部是客户端壳（数据走 /api/*），静态预渲染没有任何状态可丢，
 * 去掉之后 Next 可以在 viewport 内预取 RSC，点击不再需要跨洲往返。
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased ${displayFont.variable} ${monoFont.variable}`}>
        {/* 必须在任何命令式弹层之前装好（v1.20）：React 19 下 antd-mobile 默认渲染器会静默失效 */}
        <AntdMobileReact19Compat />
        {/* v1.25：整页加载动画（随机一种绘画过程），/admin 与 ?nofx=1 自动跳过 */}
        <PaintingSplash />
        {/* v1.29 · demoMode 改由 GET /api/me 下发（见 app/api/me/route.ts），
            否则 layout 读 process.env 会把「build 时的值」冻进静态 HTML */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}