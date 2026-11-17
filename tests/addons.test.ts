import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orderAddons } from "@/server/db/schema";
import {
  acceptOrder,
  confirmDelivered,
  createOrder,
  deliverOrder,
  expireSweep,
  pickOrder,
} from "@/server/rules/orders";
import { reportAddons } from "@/server/rules/addons";
import { toOrderDetail } from "@/server/rules/serializers";
import { advance } from "@/server/clock";
import { MIN_MS } from "@/server/rules/durations";
import { getUser, getOrder, escrowFen, logsOfOrder, SEED, A, B, C, ADMIN } from "./helpers";

const photo = "https://example.com/proof.jpg";

async function newFoodWithAddons(publisherId: number, rewardFen = 500) {
  return createOrder(publisherId, {
    bizType: "food",
    pickupPoint: "东门外卖柜",
    dropBuilding: "女寝3号楼",
    dropFloor: 4,
    dropRoom: "412",
    phoneTail: "8842",
    itemDesc: "炸鸡一份",
    rewardFen,
    acceptMinutes: 15,
    addons: [
      { title: "可乐 1 瓶", budgetFen: 400 },
      { title: "纸巾 1 包", budgetFen: 300 },
    ],
  });
}

describe("捎带项：外卖单捆绑代买（v1.3）", () => {
  it("发布时预算并入主单一起冻结，不产生第二张订单", async () => {
    const before = await getUser(A);
    const order = await newFoodWithAddons(A, 500);

    expect(order.budgetFen).toBe(700); // 400 + 300
    expect(order.rewardFen).toBe(500);
    expect(order.runnerRewardFen).toBe(375);
    // 一次冻结 1200（奖励 500 + 捎带预算 700），只有一条 freeze
    const logs = await logsOfOrder(order.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("freeze");
    expect(logs[0].amountFen).toBe(-1200);
    expect((await getUser(A)).balanceFen - before.balanceFen).toBe(-1200);

    const addons = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    expect(addons.map((a) => a.title)).toEqual(["可乐 1 瓶", "纸巾 1 包"]);
    expect(addons.every((a) => a.status === "pending")).toBe(true);
  });

  it("实付 450、另一件没买到：退 250、跑腿收 450 + Y、平台 fee = X − Y", async () => {
    const order = await newFoodWithAddons(A, 500);
    await acceptOrder(order.id, B);
    await pickOrder(order.id, B);

    const addons = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    const cola = addons.find((a) => a.title === "可乐 1 瓶")!;
    const tissue = addons.find((a) => a.title === "纸巾 1 包")!;

    const reported = await reportAddons(order.id, B, [
      { id: cola.id, actualFen: 450 },
      { id: tissue.id, failed: true },
    ]);
    expect(reported.totalActualFen).toBe(450);
    expect(reported.overBudgetFen).toBe(0);
    expect((await getOrder(order.id)).actualFen).toBe(450);

    const aBefore = await getUser(A);
    const bBefore = await getUser(B);
    await deliverOrder(order.id, B, photo);
    const { settlement } = await confirmDelivered(order.id, A);

    expect(settlement.runnerIncomeFen).toBe(375);
    expect(settlement.reimburseFen).toBe(450);
    expect(settlement.refundedBudgetFen).toBe(250); // 预算 700 − 实付 450
    expect(settlement.feeFen).toBe(125);
    expect(await escrowFen(order.id)).toBe(0);

    expect((await getUser(A)).balanceFen - aBefore.balanceFen).toBe(250);
    expect((await getUser(B)).balanceFen - bBefore.balanceFen).toBe(450 + 375);
    // 守恒：冻结 1200 = 退回 250 + 跑腿 825 + 平台 125
    expect(250 + 825 + 125).toBe(1200);
  });

  it("实付超预算：确认收货时补冻差额，不让跑腿者倒贴", async () => {
    const order = await newFoodWithAddons(A, 500);
    await acceptOrder(order.id, B);
    await pickOrder(order.id, B);
    const addons = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    await reportAddons(
      order.id,
      B,
      addons.map((a) => ({ id: a.id, actualFen: a.title === "可乐 1 瓶" ? 900 : 300 }))
    );

    expect((await getOrder(order.id)).actualFen).toBe(1200);
    const aBefore = await getUser(A);
    await deliverOrder(order.id, B, photo);
    const { settlement } = await confirmDelivered(order.id, A);

    // 预算 700，实付 1200 → 补冻 500；退回 0
    expect(settlement.refundedBudgetFen).toBe(0);
    expect(settlement.reimburseFen).toBe(1200);
    expect((await getUser(A)).balanceFen - aBefore.balanceFen).toBe(-500);
    expect(await escrowFen(order.id)).toBe(0);
  });

  it("守卫：只有接单跑腿者能报；代买单不能报；必须覆盖全部捎带项", async () => {
    const order = await newFoodWithAddons(A, 500);
    await acceptOrder(order.id, B);
    const addons = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));

    await expect(reportAddons(order.id, C, [{ id: addons[0].id, actualFen: 450 }])).rejects.toThrow(/接单跑腿者/);
    await expect(reportAddons(order.id, B, [{ id: addons[0].id, actualFen: 450 }])).rejects.toThrow(/没填实付/);
    await expect(
      reportAddons(SEED.buyOpen, B, [{ id: addons[0].id, actualFen: 450 }])
    ).rejects.toThrow(/外卖单/);
  });

  it("捎带项随加价重发一起复制到新单", async () => {
    const order = await newFoodWithAddons(A, 500);
    const { bumpOrder } = await import("@/server/rules/orders");

    await advance(16 * MIN_MS); // 接单截止 15 分钟 → 过期
    await expireSweep();
    expect((await getOrder(order.id)).status).toBe("expired");

    const { created } = await bumpOrder(order.id, A, 200);
    expect(created.rewardFen).toBe(700);
    expect(created.budgetFen).toBe(700);
    expect(created.linkedPrevId).toBe(order.id);
    const copied = await db.select().from(orderAddons).where(eq(orderAddons.orderId, created.id));
    expect(copied.map((a) => a.budgetFen).sort()).toEqual([300, 400]);
  });

  it("捎带项没确认时不许送达，也不许确认收货（m02503：钱款不能被当成全退）", async () => {
    const order = await newFoodWithAddons(A, 500);
    await acceptOrder(order.id, B);
    await pickOrder(order.id, B);

    await expect(deliverOrder(order.id, B, photo)).rejects.toThrow(/请先确认「可乐 1 瓶、纸巾 1 包」/);
    expect((await getOrder(order.id)).status).toBe("picked");

    const addons = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    await reportAddons(order.id, B, [
      { id: addons[0].id, failed: true },
      { id: addons[1].id, failed: true },
    ]);
    await deliverOrder(order.id, B, photo);

    // 模拟历史脏数据：送达后仍有 pending，发布者点确认必须被拦住
    await db
      .update(orderAddons)
      .set({ status: "pending", actualFen: null })
      .where(eq(orderAddons.orderId, order.id));
    await expect(confirmDelivered(order.id, A)).rejects.toThrow(/暂不能结算/);
    expect((await getOrder(order.id)).status).toBe("delivered");
    expect(await escrowFen(order.id)).toBe(1200); // 一分钱没动
  });

  it("自动确认时仍未上报的捎带项按「没买到」落定，预算退回发布者", async () => {
    const order = await newFoodWithAddons(A, 500);
    await acceptOrder(order.id, B);
    await pickOrder(order.id, B);
    const addons = await db.select().from(orderAddons).where(eq(orderAddons.orderId, order.id));
    await reportAddons(order.id, B, [
      { id: addons[0].id, actualFen: 450 },
      { id: addons[1].id, actualFen: 300 },
    ]);
    await deliverOrder(order.id, B, photo);

    // 把「纸巾」退回 pending（模拟旧版本留下的脏数据），等自动确认兜底
    await db
      .update(orderAddons)
      .set({ status: "pending", actualFen: null })
      .where(and(eq(orderAddons.orderId, order.id), eq(orderAddons.title, "纸巾 1 包")));

    const aBefore = await getUser(A);
    await advance(3 * 60 * MIN_MS);
    await expireSweep();

    const done = await getOrder(order.id);
    expect(done.status).toBe("completed");
    expect(done.actualFen).toBe(450);
    // 提前还冻结的 1200：跑腿 375 + 报销 450 + 平台 125 + 退发布者 250
    expect(await escrowFen(order.id)).toBe(0);
    const logs = await logsOfOrder(order.id);
    expect(logs.find((l) => l.type === "refund")?.amountFen).toBe(250);
    expect((await getUser(A)).balanceFen).toBeGreaterThanOrEqual(aBefore.balanceFen);
  });

  it("管理员看清楚完整记录（房号/尾号），普通旁观者仍被过滤（m02503）", async () => {
    const order = await newFoodWithAddons(A, 500);
    await acceptOrder(order.id, B);
    const row = await getOrder(order.id);

    const viewer = toOrderDetail(row, { id: C });
    expect(viewer.dropRoom).toBeNull();
    expect(viewer.phoneTail).toBeNull();
    expect(viewer.viewAsAdmin).toBe(false);

    const admin = toOrderDetail(row, { id: ADMIN, isAdmin: true });
    expect(admin.dropRoom).toBe("412");
    expect(admin.phoneTail).toBe("8842");
    expect(admin.viewAsAdmin).toBe(true);

    // 管理员仍不能替双方做确认动作（只读）
    expect(admin.canConfirm).toBe(false);
  });
});
