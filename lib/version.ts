/**
 * v1.42 · 发版身份（唯一真相）
 *
 * 目的：回答「我部署的到底是不是最新版」。以前只能靠比对 chunk 哈希或肉眼找新气泡，
 * 现在 GET /api/version 和「我的」页脚都会吐这两个值。
 *
 * 规矩：**每次发版只改这里的两行**，并让它与 docs/HANDOFF.md 的版本号、package.json 一致。
 * 别改成从环境变量读——那样部署时忘了设变量就变成「版本未定义」，反而更难查。
 */
export const APP_VERSION = "v1.42";
export const APP_RELEASE = "2026-11-17";
