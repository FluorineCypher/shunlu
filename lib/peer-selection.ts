/**
 * v1.15 · 详情页「同栋多单」勾选的合并规则。
 *
 * 背景：详情页每 5 秒轮询一次 `/api/orders/[id]`，`data.order` 每次都是新对象；
 * 旧实现把「拉 peers + 重置勾选」放在依赖 `openOrder` 的 effect 里，于是每次轮询
 * 都会把用户勾选覆盖回默认的前 N 单（见 docs/PROGRESS.md v1.15）。
 * 这里把「该保留哪些」抽成纯函数，组件只在数据变化时调用它，轮询不再动勾选。
 *
 * 规则：
 * - 首次进入某张单（initialize=true）：按列表顺序默认勾前 capacity 个可接单；
 * - 之后：已勾且仍存在的单原样保留；被抢走 / 过期 / 变成不可接（女生单）的从勾选里移除；
 * - 移除后留下空位时，按列表「从上到下」补第一个还没勾的可接单，补回移除前的勾选数量
 *   （不是补满 capacity —— 用户主动取消的单不该被自动加回来）；
 * - 并发位缩小时从尾部裁到 capacity；并发位变大不自动补选。
 */
export type PeerCandidate = { id: number; blockedByGender?: boolean | null };

/**
 * v1.18 · 首次进入时**是否**该落默认勾选。
 *
 * 以前页面一拿到数据就把「已经初始化过」记上，即便这一刻本栋一单可接的都没有
 * （接口刚返回空 / 全是女生单）——于是默认勾选被消费成 0 个，之后补回来也不可能：
 * 合并规则里 `target = min(prev.length, cap)`，prev 空、target 就永远是 0。
 * 表现为「明明写着还能带 N 单，却一个都没勾（且点了也没反应）」。
 *
 * 现在只有本栋确实存在可接单时才消费「首次」；候选暂时为空或全被性别拦下，
 * 就把这一次默认勾选留到下一轮轮询。
 */
export function shouldApplyDefault(args: {
  alreadyInitialized: boolean;
  candidates: PeerCandidate[];
}): boolean {
  if (args.alreadyInitialized) return false;
  return args.candidates.some((c) => !c.blockedByGender);
}


export function mergePeerPicked(args: {
  prev: number[];
  candidates: PeerCandidate[];
  capacity: number;
  initialize: boolean;
}): number[] {
  const { prev, candidates, capacity, initialize } = args;
  const eligible = candidates.filter((c) => !c.blockedByGender).map((c) => c.id);
  const cap = Math.max(0, capacity);

  // 首次进入这张单：默认按剩余并发位勾好，同层排在前面（列表顺序由调用方决定）
  if (initialize) return eligible.slice(0, cap);

  const kept = prev.filter((id) => eligible.includes(id));
  const target = Math.min(prev.length, cap);

  // 并发位缩水：从尾部裁掉超出的勾选（保留用户勾选顺序）
  if (kept.length > target) return kept.slice(0, target);
  if (kept.length === target) return kept;

  // 有单被抢走 / 不可接了：从列表顶部往下找第一个空位补上，保持原来的勾选数量
  const seen = new Set(kept);
  for (const id of eligible) {
    if (kept.length >= target) break;
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return kept;
}
