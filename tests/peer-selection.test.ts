import { describe, expect, it } from "vitest";
import { mergePeerPicked, shouldApplyDefault, type PeerCandidate } from "@/lib/peer-selection";

const p = (id: number, blockedByGender = false): PeerCandidate => ({ id, blockedByGender });

describe("mergePeerPicked", () => {
  it("首次进入：按列表顺序默认勾前 capacity 个", () => {
    expect(
      mergePeerPicked({ prev: [], candidates: [p(1), p(2), p(3), p(4)], capacity: 2, initialize: true }),
    ).toEqual([1, 2]);
  });

  it("首次进入：跳过不可接（女生单）的单", () => {
    expect(
      mergePeerPicked({ prev: [], candidates: [p(1, true), p(2), p(3)], capacity: 2, initialize: true }),
    ).toEqual([2, 3]);
  });

  it("订单增加不影响已有勾选", () => {
    expect(
      mergePeerPicked({ prev: [2, 4], candidates: [p(1), p(2), p(3), p(4), p(5)], capacity: 2, initialize: false }),
    ).toEqual([2, 4]);
  });

  it("被抢走一单：其余不动，空位从列表顶部往下补第一个可接的", () => {
    expect(
      mergePeerPicked({ prev: [2, 4], candidates: [p(1), p(3), p(4)], capacity: 2, initialize: false }),
    ).toEqual([4, 1]);
  });

  it("补位跳过已被勾选的单和不可接的单", () => {
    expect(
      mergePeerPicked({ prev: [3, 9], candidates: [p(1, true), p(2), p(3)], capacity: 3, initialize: false }),
    ).toEqual([3, 2]);
  });

  it("用户主动少勾：被抢后只补回原来的数量，不补满 capacity", () => {
    expect(
      mergePeerPicked({ prev: [5], candidates: [p(1), p(2), p(5)], capacity: 2, initialize: false }),
    ).toEqual([5]);
    expect(
      mergePeerPicked({ prev: [4], candidates: [p(1), p(2), p(3)], capacity: 2, initialize: false }),
    ).toEqual([1]);
  });

  it("并发位缩水：从尾部裁到 capacity", () => {
    expect(
      mergePeerPicked({ prev: [3, 5, 7], candidates: [p(1), p(3), p(5), p(7)], capacity: 1, initialize: false }),
    ).toEqual([3]);
  });

  it("并发位变大：不自动补选", () => {
    expect(
      mergePeerPicked({ prev: [1], candidates: [p(1), p(2), p(3)], capacity: 3, initialize: false }),
    ).toEqual([1]);
  });

  it("已勾的单变成不可接（女生单）：移除并从顶部补位", () => {
    expect(
      mergePeerPicked({ prev: [1, 2], candidates: [p(1), p(2, true), p(3)], capacity: 2, initialize: false }),
    ).toEqual([1, 3]);
  });

  it("capacity 为 0：什么都不勾", () => {
    expect(
      mergePeerPicked({ prev: [1], candidates: [p(1), p(2)], capacity: 0, initialize: false }),
    ).toEqual([]);
    expect(
      mergePeerPicked({ prev: [], candidates: [p(1)], capacity: 0, initialize: true }),
    ).toEqual([]);
  });
});

describe("shouldApplyDefault", () => {
  it("首次进入且本栋有可接的单：落默认勾选", () => {
    expect(shouldApplyDefault({ alreadyInitialized: false, candidates: [p(1), p(2)] })).toBe(true);
  });

  it("首次进入但本栋一单都没有：不消费默认勾选（等下一轮）", () => {
    expect(shouldApplyDefault({ alreadyInitialized: false, candidates: [] })).toBe(false);
  });

  it("首次进入但本栋全是女生单（男跑手）：不消费默认勾选", () => {
    expect(shouldApplyDefault({ alreadyInitialized: false, candidates: [p(1, true), p(2, true)] })).toBe(false);
  });

  it("已经初始化过：不再落默认勾选", () => {
    expect(shouldApplyDefault({ alreadyInitialized: true, candidates: [p(1)] })).toBe(false);
  });
});

