/**
 * 预热 CDN 静态资源（v1.11，本机演示用，不属于业务代码）：
 *
 * 为什么需要：演示走 Cloudflare 隧道时，每个 `/_next/static/*` 文件的**第一次**请求
 * 都是 MISS（要回源到这台机器，手机上要等 1–2s；一屏十几个文件就是明显的「加载很久」）。
 * 这个脚本在发布/重启之后跑一遍，把这些文件先拉一遍，让 CF 边缘提前缓存，
 * 之后评委/同学第一次打开就是 HIT。
 *
 * 用法：
 *   node scripts/warm-cdn.mjs                       # 默认 APP_URL 或 https://shop.omzsh.top
 *   node scripts/warm-cdn.mjs https://shop.omzsh.top
 *   node scripts/warm-cdn.mjs http://127.0.0.1:3000  # 本机（没走 CF 时只是空跑）
 */
const DEFAULT_HOST = "https://shop.omzsh.top";
const PAGES = ["/", "/login", "/publish", "/me", "/admin/console"];

function loadEnv() {
  try {
    require("dotenv").config({ path: [".env.local", ".env"], quiet: true });
  } catch {
    /* 允许外部注入 */
  }
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "cache-control": "no-cache" } });
  return { status: res.status, body: await res.text() };
}

/** 从 HTML 里抓出所有 /_next/static/... 资源（含 css/js/字体） */
function assetUrls(html) {
  const out = new Set();
  const re = /\/_next\/static\/[A-Za-z0-9_\-./[\]]+?\.(?:js|css|woff2?|png|svg|jpg|webp)/g;
  for (const m of html.matchAll(re)) out.add(m[0]);
  return [...out];
}

async function pool(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  loadEnv();
  const host = (process.argv[2] || process.env.APP_URL || DEFAULT_HOST).replace(/\/$/, "");
  console.log(`[warm-cdn] 预热 ${host}`);

  const assets = new Set();
  for (const page of PAGES) {
    try {
      const { status, body } = await fetchText(host + page);
      const found = assetUrls(body);
      found.forEach((a) => assets.add(a));
      console.log(`  页面 ${page.padEnd(16)} ${status}  资源 ${found.length}`);
    } catch (err) {
      console.warn(`  页面 ${page} 失败：${err instanceof Error ? err.message : err}`);
    }
  }

  const list = [...assets];
  let hit = 0;
  let miss = 0;
  let failed = 0;
  const started = Date.now();
  await pool(list, 6, async (path) => {
    try {
      const res = await fetch(host + path, { headers: { "cache-control": "no-cache" } });
      await res.arrayBuffer();
      const cache = res.headers.get("cf-cache-status");
      if (cache === "HIT") hit += 1;
      else if (cache) miss += 1;
    } catch {
      failed += 1;
    }
  });

  console.log(
    `[warm-cdn] 共 ${list.length} 个资源，${((Date.now() - started) / 1000).toFixed(1)}s；` +
      `边缘命中 ${hit} / 已回源 ${miss} / 失败 ${failed}` +
      (list.length > 0 && miss === 0 ? "（已全部预热，若还有 MISS 再跑一次）" : ""),
  );
}

main().catch((err) => {
  console.error("[warm-cdn] 失败：", err);
  process.exit(1);
});
