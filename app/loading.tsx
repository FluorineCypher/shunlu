/**
 * v1.29 · 全局路由骨架屏。
 *
 * 为什么有这个文件：实测一次导航的 RSC 往返 p50 是 773ms（载荷只有 1.7KB），
 * 而「app 下任意层级的 loading.tsx」原来一个都没有 —— 点下去到壳子出现之间，屏幕上零变化，
 * 这就是「点了没反应」的 0–0.8 秒。有了这个文件，Next 会把它当作该路由的
 * Suspense fallback：点击瞬间先渲染骨架，真正的页面到了再替换。
 *
 * 骨架的形状对齐大厅卡片（标题块 + 3 张单卡），所以替换时布局不跳。
 */
export default function Loading() {
  return (
    <div className="px-4 pt-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">加载中</span>
      {/* v1.35：eyebrow 等宽小字 + 衬线/铅字条骨架 = 纸张印刷的观感 */}
      <div className="sl-kicker">顺路 · 正在铺纸</div>
      <div className="sl-skel mt-3 h-7 w-40" />
      <div className="sl-skel mt-2.5 h-3 w-52" />
      <div className="mt-6 space-y-3.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sl-paper">
            <div className="sl-paper-core p-4">
              <div className="flex items-center justify-between">
                <div className="sl-skel h-4 w-24" />
                <div className="sl-skel h-4 w-14" />
              </div>
              <div className="sl-skel mt-3.5 h-3 w-full" />
              <div className="sl-skel mt-2 h-3 w-2/3" />
              <div className="mt-4 flex items-center gap-2">
                <div className="sl-skel h-6 w-16" />
                <div className="sl-skel h-6 w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
