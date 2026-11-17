import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { orderAddons, orders } from "@/server/db/schema";
import { resetAndSeed } from "@/server/demo/seed";
import { acceptBatch, acceptOrder, confirmDelivered, deliverOrder, pickOrder } from "@/server/rules/orders";
import { getBatchDetail, setBatchAutoComplete } from "@/server/rules/batches";
import { calcBonusFen } from "@/server/rules/constants";
import { A, ADMIN, B, C, D, SEED, assertUserBalance, escrowFen, failPendingAddons, getBatch, getOrder, getUser, logsOfOrder } from "./helpers";

const PROOF = "https://example.com/proof.jpg";

/** 把一单从 accepted 走到 completed（跑腿者 B，发布者按种子取） */
async function runToCompleted(orderId: number, runnerId: number) {
  const order = await getOrder(orderId);
  await pickOrder(orderId, runnerId);
  await failPendingAddons(orderId, runnerId);
  await deliverOrder(orderId, runnerId, PROOF);
  return confirmDelivered(orderId, order.publisherId);
}

describe("批次（P4）", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("同楼 2 单批量接单：建批次、两单都绑到同一跑腿者", async () => {
    const res = await acceptBatch([SEED.open1, SEED.open2], C);
    expect(res.batchId).toBeGreaterThan(0);
    const batch = await getBatch(res.batchId);
    expect(batch?.runnerId).toBe(C);
    expect(batch?.orderCount).toBe(2);
    expect(batch?.expectedRewardFen).toBe(
      (await getOrder(SEED.open1)).runnerRewardFen + (await getOrder(SEED.open2)).runnerRewardFen
    );

    const o1 = await getOrder(SEED.open1);
    const o2 = await getOrder(SEED.open2);
    expect(o1.status).toBe("accepted");
    expect(o2.status).toBe("accepted");
    expect(o1.runnerId).toBe(C);
    expect(o2.runnerId).toBe(C);
    expect(o1.batchId).toBe(res.batchId);
  });

  it("部分被抢：整批回滚，一单都没接住，也不留空批次", async () => {
    // B 先单接 12 号，C 再批量接 [12, 13] → 条件 UPDATE 命中 0 行
    await acceptOrder(SEED.open1, B);
    await expect(acceptBatch([SEED.open1, SEED.open2], C)).rejects.toThrow(/已被其他跑腿者接单|批量接单失败/);

    const o1 = await getOrder(SEED.open1);
    const o2 = await getOrder(SEED.open2);
    expect(o1.runnerId).toBe(B);
    expect(o2.status).toBe("open");
    expect(o2.runnerId).toBeNull();
    expect(o2.batchId).toBeNull();
    // C 名下没有被批次绑定的单（种子里 C 有过往已完成单，故不能直接数 runner_id）
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.runnerId, C), isNotNull(orders.batchId)));
    expect(rows.length).toBe(0);
  });

  it("跨楼栋 / 少于 2 单 / 重复 id 一律拒绝", async () => {
    await expect(acceptBatch([SEED.open1], B)).rejects.toThrow(/至少选择 2 单/);
    await expect(acceptBatch([SEED.open1, SEED.open1], B)).rejects.toThrow(/重复/);
    // 15 号是代买单，也在女寝 3 号楼：先造一单别的楼栋
    const foreign = (
      await db
        .insert(orders)
        .values({
          code: "T-FOREIGN",
          publisherId: D,
          bizType: "food",
          status: "open",
          pickupPoint: "东门外卖柜",
          dropBuilding: "男寝5号楼",
          dropFloor: 2,
          dropRoom: "201",
          phoneTail: "1234",
          rewardFen: 400,
          runnerRewardFen: 300,
          acceptDeadlineAt: new Date(Date.now() + 10 * 60_000),
        })
        .returning()
    )[0];
    await expect(acceptBatch([SEED.open1, foreign.id], B)).rejects.toThrow(/同一栋楼|同一楼栋/);
    expect((await getOrder(SEED.open1)).status).toBe("open");
  });

  it("批次加成：3 单同楼完成，每单 Y + bonus 入账，平台 fee = X − Y − bonus", async () => {
    // v1.43 · #16 从 v1.41 起挂在 C 头上，C 已占 1 个并发位；B 才是空手，3 单批次用 B
    const res = await acceptBatch([SEED.open1, SEED.open2, SEED.open3], B);
    const ids = [SEED.open1, SEED.open2, SEED.open3];

    let expectIncome = 0;
    let expectBonus = 0;
    for (const id of ids) {
      const before = await getOrder(id);
      await runToCompleted(id, B);
      const after = await getOrder(id);
      expect(after.status).toBe("completed");
      const bonus = calcBonusFen(before.runnerRewardFen);
      expectIncome += before.runnerRewardFen;
      expectBonus += bonus;

      const logs = await logsOfOrder(id);
      expect(logs.find((l) => l.type === "income" && l.userId === B)?.amountFen).toBe(
        before.runnerRewardFen
      );
      expect(logs.find((l) => l.type === "bonus" && l.userId === B)?.amountFen).toBe(bonus);
      expect(logs.find((l) => l.type === "fee")?.amountFen).toBe(before.rewardFen - before.runnerRewardFen - bonus);
      // 每单结算后托管清零
      expect(await escrowFen(id)).toBe(0);
    }

    const detail = await getBatchDetail(res.batchId, B);
    expect(detail.bonusEligible).toBe(true);
    expect(detail.totals.expectedRewardFen).toBe(expectIncome);
    expect(detail.totals.potentialBonusFen).toBe(expectBonus);
    expect(detail.totals.expectedTotalFen).toBe(expectIncome + expectBonus);
    expect(detail.totals.earnedFen).toBe(expectIncome + expectBonus);
    expect(detail.totals.earnedBonusFen).toBe(expectBonus);
    expect(detail.totals.settledCount).toBe(3);
    expect(detail.batch.allDone).toBe(true);
    expect((await getBatch(res.batchId))?.status).toBe("closed");
    await assertUserBalance(B);
  });

  it("批次内一单超时不影响其他单；超时单回 open、其他单照常结算", async () => {
    const res = await acceptBatch([SEED.open1, SEED.open2], B);
    await pickOrder(SEED.open1, B);
    await pickOrder(SEED.open2, B);

    // 只把 12 号推到送达截止之后（直接改库，规则本身在 lifecycle 测过）
    await db
      .update(orders)
      .set({ deliverDeadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(orders.id, SEED.open1));

    const { expireSweep } = await import("@/server/rules/orders");
    await expireSweep();

    expect((await getOrder(SEED.open1)).status).toBe("abnormal");
    expect((await getOrder(SEED.open2)).status).toBe("picked");

    // 13 号还能继续跑完
    await failPendingAddons(SEED.open2, B);
    await deliverOrder(SEED.open2, B, PROOF);
    await confirmDelivered(SEED.open2, (await getOrder(SEED.open2)).publisherId);
    expect((await getOrder(SEED.open2)).status).toBe("completed");

    const detail = await getBatchDetail(res.batchId, B);
    expect(detail.totals.failedCount).toBe(1);
    expect(detail.totals.settledCount).toBe(1);
    expect(detail.batch.allDone).toBe(true);
  });

  it("送达即完成开关：只有接单跑腿者能改，批次结束后不能再改", async () => {
    const res = await acceptBatch([SEED.open1, SEED.open2], B);
    await expect(setBatchAutoComplete(res.batchId, C, false)).rejects.toThrow(/只有接单跑腿者/);

    const off = await setBatchAutoComplete(res.batchId, B, false);
    expect(off.autoComplete).toBe(false);
    expect((await getBatch(res.batchId))?.autoComplete).toBe(false);

    // 两单都完成 → 批次关闭
    await runToCompleted(SEED.open1, B);
    await runToCompleted(SEED.open2, B);
    await expect(setBatchAutoComplete(res.batchId, B, true)).rejects.toThrow(/批次已结束/);
  });

  it("批次详情权限：参与者可看，旁观者 403，管理员可看", async () => {
    const res = await acceptBatch([SEED.open1, SEED.open2], B);
    await expect(getBatchDetail(res.batchId, C)).rejects.toThrow(/只有本批次的参与者/);

    const asRunner = await getBatchDetail(res.batchId, B);
    expect(asRunner.isRunner).toBe(true);
    expect(asRunner.orders.length).toBe(2);

    // 发布者（D 发了 12/13）也能看，但看不到跑腿者的房号视角
    const asPublisher = await getBatchDetail(res.batchId, D);
    expect(asPublisher.isRunner).toBe(false);
    expect(asPublisher.orders[0].dropRoom).toBeNull();

    const asAdmin = await getBatchDetail(res.batchId, ADMIN, true);
    expect(asAdmin.orders[0].dropRoom).toBe("412");
    expect(asAdmin.isRunner).toBe(false);
  });

  it("批次详情里的「已到账」只算 income + bonus，不含退款与报销", async () => {
    const res = await acceptBatch([SEED.open1, SEED.open2], B);
    // 12 号带 1 件捎带（种子），实付 380 → income 里含报销，但 earned 只算 Y + bonus
    await pickOrder(SEED.open1, B);
    const { reportAddons } = await import("@/server/rules/addons");
    const detail0 = await getBatchDetail(res.batchId, B);
    const addonId = (await db.select().from(orderAddons).where(eq(orderAddons.orderId, SEED.open1)))[0].id;
    expect(addonId).toBeGreaterThan(0);
    await reportAddons(SEED.open1, B, [{ id: addonId, actualFen: 380 }]);
    await deliverOrder(SEED.open1, B, PROOF);
    const order = await getOrder(SEED.open1);
    await confirmDelivered(SEED.open1, order.publisherId);

    const detail = await getBatchDetail(res.batchId, B);
    // 只有 12 号完成、且 2 单不触发加成 → 已到账 = 12 号的 Y
    expect(detail.totals.earnedFen).toBe((await getOrder(SEED.open1)).runnerRewardFen);
    expect(detail.totals.earnedBonusFen).toBe(0);
    expect(detail0.totals.earnedFen).toBe(0);
    // 报销确实进了钱包，但不计入「本趟赚」
    const logs = await logsOfOrder(SEED.open1);
    expect(logs.some((l) => l.type === "income" && l.amountFen === 380)).toBe(true);
    await assertUserBalance(B);
    // 种子里的 A 单不受影响，余额不变式仍成立
    await assertUserBalance(A);
    expect((await getUser(A)).id).toBe(A);
  });
});
