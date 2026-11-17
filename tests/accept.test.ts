import { describe, expect, it, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { batches, orders, users } from "@/server/db/schema";
import { acceptBatch, acceptOrder, cancelOrder, createOrder } from "@/server/rules/orders";
import { SEED, B, C, A, D, E, getUser, getOrder, escrowFen } from "./helpers";

describe("A2 接单：原子性与容量（§3.2 / §3.4）", () => {
  it("并发接单只有一人成功，另一人收到「已被接单」提示", async () => {
    const [first, second] = await Promise.allSettled([acceptOrder(SEED.open1, B), acceptOrder(SEED.open1, C)]);
    const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const order = await getOrder(SEED.open1);
    expect(order.status).toBe("accepted");
    expect([B, C]).toContain(order.runnerId);
    expect(order.deliverDeadlineAt).not.toBeNull();

    const loser = [first, second].find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(loser.reason?.message ?? loser.reason)).toContain("已被其他跑腿者接单");
  });

  it("不能接自己发布的订单", async () => {
    await expect(acceptOrder(SEED.open3, A)).rejects.toThrow(/自己发布/);
    await expect(acceptOrder(SEED.open1, 4 /* D：12 的发布者 */)).rejects.toThrow(/自己发布/);
  });

  it("批次里有一单被抢 → 整批回滚，一单都没接住", async () => {
    await acceptOrder(SEED.open1, B); // 12 被 B 接走

    await expect(acceptBatch([SEED.open1, SEED.open2, SEED.open3], C)).rejects.toThrow(/已被其他跑腿者接单/);

    const o2 = await getOrder(SEED.open2);
    const o3 = await getOrder(SEED.open3);
    expect(o2.status).toBe("open");
    expect(o3.status).toBe("open");
    expect(o2.runnerId).toBeNull();
    expect(o3.runnerId).toBeNull();

    const batchRows = await db.select().from(batches);
    expect(batchRows).toHaveLength(0);
  });

  it("批次全部成功：生成批次、三单绑定同一 runner", async () => {
    const { batchId, orders: accepted } = await acceptBatch([SEED.open1, SEED.open2, SEED.open3], C);
    expect(accepted).toHaveLength(3);

    const batch = (await db.select().from(batches).where(eq(batches.id, batchId)))[0];
    expect(batch.orderCount).toBe(3);
    expect(batch.runnerId).toBe(C);
    expect(batch.expectedRewardFen).toBe(
      accepted.reduce((sum, o) => sum + o.runnerRewardFen, 0)
    );

    for (const id of [SEED.open1, SEED.open2, SEED.open3]) {
      const o = await getOrder(id);
      expect(o.status).toBe("accepted");
      expect(o.runnerId).toBe(C);
      expect(o.batchId).toBe(batchId);
    }
    // 接单不动钱：托管额仍是「奖励 + 捎带预算」全额
    const o1 = await getOrder(SEED.open1);
    expect(await escrowFen(SEED.open1)).toBe(o1.rewardFen + o1.budgetFen);
  });

  it("信用分 < 60 禁接单", async () => {
    await db.update(users).set({ creditScore: 50 }).where(eq(users.id, B));
    await expect(acceptOrder(SEED.open2, B)).rejects.toThrow(/信用分/);
    const order = await getOrder(SEED.open2);
    expect(order.status).toBe("open");
  });

  it("同时在手 3 单封顶（信用≥60 时）", async () => {
    // B 已持有 1 单（#16），再拿 2 单到 3，第 4 单被拒
    await acceptOrder(SEED.open1, B);
    await acceptOrder(SEED.open2, B);
    await expect(acceptOrder(SEED.open3, B)).rejects.toThrow(/同时最多 3 单/);

    const active = await db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(orders)
      .where(sql`${orders.runnerId} = ${B} AND ${orders.status} IN ('accepted','picked','delivered')`);
    expect(active[0]?.n).toBe(3);
  });
});

describe("A1 发布守卫", () => {
  beforeEach(async () => {
    // 取消种子里的 open 单（不能直接 delete：wallet_logs 外键引用了它们），腾出发布额度
    await cancelOrder(SEED.open1, D);
    await cancelOrder(SEED.open2, D);
    await cancelOrder(SEED.open3, A);
    await cancelOrder(SEED.buyOpen, E);
  });

  it("赏金越界 / 代买缺额度 / 楼栋为空都被拒", async () => {
    const base = {
      bizType: "food" as const,
      pickupPoint: "东门外卖柜",
      dropBuilding: "女寝3号楼",
      rewardFen: 500,
    };
    await expect(createOrder(C, { ...base, rewardFen: 100 })).rejects.toThrow(/赏金/);
    await expect(createOrder(C, { ...base, rewardFen: 5000 })).rejects.toThrow(/赏金/);
    await expect(createOrder(C, { ...base, bizType: "buy", rewardFen: 300 })).rejects.toThrow(/额度/);
    await expect(createOrder(C, { ...base, dropBuilding: "  " })).rejects.toThrow(/楼栋/);
  });

  it("同一发布者同时 open ≤ 2", async () => {
    const base = {
      bizType: "food" as const,
      pickupPoint: "东门外卖柜",
      dropBuilding: "女寝3号楼",
      rewardFen: 300,
    };
    await createOrder(A, base);
    await createOrder(A, base);
    await expect(createOrder(A, base)).rejects.toThrow(/最多可发布 2 条/);
  });

  it("发布即冻结：余额 −(奖励+额度)，账本记账", async () => {
    const before = await getUser(C);
    const order = await createOrder(C, {
      bizType: "buy",
      pickupPoint: "校内超市",
      dropBuilding: "女寝3号楼",
      rewardFen: 300,
      budgetFen: 800,
    });
    const after = await getUser(C);
    expect(before.balanceFen - after.balanceFen).toBe(1100);
    expect(await escrowFen(order.id)).toBe(1100);
  });
});
