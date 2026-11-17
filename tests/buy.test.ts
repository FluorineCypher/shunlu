import { describe, expect, it } from "vitest";
import { advance } from "@/server/clock";
import {
  acceptBatch,
  acceptOrder,
  confirmDelivered,
  createOrder,
  deliverOrder,
  expireSweep,
  pickOrder,
} from "@/server/rules/orders";
import { agreeBudget, confirmBudget, declineBudget, reportActual, requestBudget } from "@/server/rules/buy";
import { MIN_MS } from "@/server/rules/durations";
import { getUser, getOrder, escrowFen, logsOfOrder, failPendingAddons, SEED, A, B, C, D, E, PLATFORM } from "./helpers";

const photo = "https://example.com/buy.jpg";

async function newBuyOrder(publisherId: number, rewardFen = 300, budgetFen = 1000) {
  return createOrder(publisherId, {
    bizType: "buy",
    pickupPoint: "校内超市",
    dropBuilding: "女寝3号楼",
    rewardFen,
    budgetFen,
    acceptMinutes: 30,
  });
}

describe("代买 M4 找零（§3.3 / 附录 A）", () => {
  it("额度 1000 实付 450：退 550、跑腿收 450 + Y，结算后托管归零且守恒", async () => {
    const eBefore = await getUser(E);
    const cBefore = await getUser(C);

    await acceptOrder(SEED.buyOpen, C);
    const reported = await reportActual(SEED.buyOpen, C, { actualFen: 450, photoUrl: photo });
    expect(reported.status).toBe("picked");
    expect(reported.actualFen).toBe(450);

    const m4 = await confirmBudget(SEED.buyOpen, E);
    expect(m4.refundFen).toBe(550);
    expect(m4.reimburseFen).toBe(450);
    // 找零后托管只剩奖励 300
    expect(await escrowFen(SEED.buyOpen)).toBe(300);

    await deliverOrder(SEED.buyOpen, C, photo);
    const { settlement } = await confirmDelivered(SEED.buyOpen, E);
    expect(settlement.runnerIncomeFen).toBe(225);
    expect(settlement.feeFen).toBe(75);
    expect(settlement.bonusFen).toBe(0);
    expect(await escrowFen(SEED.buyOpen)).toBe(0);

    // E：种子已冻结 1300，找零退回 550 → 净变化 +550（奖励 300 由结算消化、垫付 450 已报销给跑腿者）
    expect((await getUser(E)).balanceFen - eBefore.balanceFen).toBe(550);
    // C：报销 450 + 奖励 225
    expect((await getUser(C)).balanceFen - cBefore.balanceFen).toBe(675);

    const logs = await logsOfOrder(SEED.buyOpen);
    const types = logs.map((l) => l.type).sort();
    expect(types).toEqual(["fee", "freeze", "income", "income", "refund"]);
    expect(logs.filter((l) => l.type === "income").map((l) => l.amountFen).sort((a, b) => a - b)).toEqual([225, 450]);
  });

  it("实付超额度必须先申请；同意后追加冻结、额度上调", async () => {
    const order = await newBuyOrder(E, 300, 1000);
    await acceptOrder(order.id, C);

    await expect(reportActual(order.id, C, { actualFen: 1200, photoUrl: photo })).rejects.toThrow(/超过额度/);

    const requested = await requestBudget(order.id, C, 1200);
    expect(requested.budgetStatus).toBe("requested");
    expect(requested.requestedBudgetFen).toBe(1200);

    const eBefore = await getUser(E);
    const agreed = await agreeBudget(order.id, E);
    expect(agreed.budgetStatus).toBe("agreed");
    expect(agreed.budgetFen).toBe(1200);
    expect(eBefore.balanceFen - (await getUser(E)).balanceFen).toBe(200); // 追加冻结
    expect(await escrowFen(order.id)).toBe(300 + 1200);

    await reportActual(order.id, C, { actualFen: 1200, photoUrl: photo });
    const m4 = await confirmBudget(order.id, E);
    expect(m4.refundFen).toBe(0);
    expect(await escrowFen(order.id)).toBe(300);
  });

  it("拒绝加额度 → 回到 none，按原额度继续买", async () => {
    const order = await newBuyOrder(E, 300, 1000);
    await acceptOrder(order.id, C);
    await requestBudget(order.id, C, 1200);

    const declined = await declineBudget(order.id, E);
    expect(declined.budgetStatus).toBe("none");
    expect(declined.requestedBudgetFen).toBeNull();

    const picked = await reportActual(order.id, C, { actualFen: 1000, photoUrl: photo });
    expect(picked.status).toBe("picked");

    const m4 = await confirmBudget(order.id, E);
    expect(m4.refundFen).toBe(0);
    expect(m4.reimburseFen).toBe(1000);
  });

  it("超额度不回应到 deliver_deadline → abandoned + cancelled + 全额退款，跑腿者不扣信用", async () => {
    const order = await newBuyOrder(E, 300, 1000);
    await acceptOrder(order.id, C);
    await requestBudget(order.id, C, 1200);
    const cBefore = await getUser(C);
    const eBefore = await getUser(E);

    await advance(21 * MIN_MS);
    await expireSweep();

    const after = await getOrder(order.id);
    expect(after.status).toBe("cancelled");
    expect(after.budgetStatus).toBe("abandoned");
    expect(await escrowFen(order.id)).toBe(0);

    expect((await getUser(E)).balanceFen - eBefore.balanceFen).toBe(1300);
    expect((await getUser(C)).creditScore).toBe(cBefore.creditScore);
  });

  it("发布者没走 M4 就确认收货：额度余额随结算原路退回（fail-safe，托管归零）", async () => {
    await acceptOrder(SEED.buyOpen, C);
    await reportActual(SEED.buyOpen, C, { actualFen: 450, photoUrl: photo });
    await deliverOrder(SEED.buyOpen, C, photo);

    const eBefore = await getUser(E);
    const { settlement } = await confirmDelivered(SEED.buyOpen, E);
    expect(settlement.refundedBudgetFen).toBe(1000);
    expect(await escrowFen(SEED.buyOpen)).toBe(0);
    expect((await getUser(E)).balanceFen - eBefore.balanceFen).toBe(1000);
  });
});

describe("批次加成（同楼 ≥3 单，每单 bonus = round(Y×5%)，平台让利）", () => {
  it("三单批次逐单结算：income = Y + bonus，fee = X − Y − bonus", async () => {
    const cBefore = await getUser(C);
    const platformBefore = await getUser(PLATFORM);

    const { batchId, orders } = await acceptBatch([SEED.open1, SEED.open2, SEED.open3], C);
    expect(orders).toHaveLength(3);

    for (const o of orders) {
      await pickOrder(o.id, C);
      await failPendingAddons(o.id, C);
      await deliverOrder(o.id, C, photo);
      await confirmDelivered(o.id, o.publisherId);
    }

    let expectedIncome = 0;
    let expectedBonus = 0;
    let expectedFee = 0;
    const rows = [SEED.open1, SEED.open2, SEED.open3];
    for (const id of rows) {
      const order = await getOrder(id);
      expect(order.status).toBe("completed");
      expect(order.batchId).toBe(batchId);

      const logs = await logsOfOrder(id);
      const income = logs.find((l) => l.type === "income")!;
      const bonus = logs.find((l) => l.type === "bonus");
      const fee = logs.find((l) => l.type === "fee")!;
      expect(income.amountFen).toBe(order.runnerRewardFen);
      expect(bonus?.amountFen ?? 0).toBe(Math.round(order.runnerRewardFen * 0.05));
      expect(fee.amountFen).toBe(order.rewardFen - order.runnerRewardFen - (bonus?.amountFen ?? 0));

      expectedIncome += income.amountFen;
      expectedBonus += bonus?.amountFen ?? 0;
      expectedFee += fee.amountFen;
      expect(await escrowFen(id)).toBe(0);
    }

    expect((await getUser(C)).balanceFen - cBefore.balanceFen).toBe(expectedIncome + expectedBonus);
    expect((await getUser(PLATFORM)).balanceFen - platformBefore.balanceFen).toBe(expectedFee);
    expect(expectedIncome + expectedBonus + expectedFee).toBe(350 + 400 + 500);
  });
});

describe("代买动作守卫", () => {
  it("非 buy 订单不能走代买动作", async () => {
    await acceptOrder(SEED.open1, B);
    await expect(reportActual(SEED.open1, B, { actualFen: 100, photoUrl: photo })).rejects.toThrow(/代买/);
  });

  it("只有接单跑腿者能上报实付，只有发布者能确认找零", async () => {
    await acceptOrder(SEED.buyOpen, C);
    await expect(
      reportActual(SEED.buyOpen, B, { actualFen: 450, photoUrl: photo })
    ).rejects.toThrow(/接单跑腿者/);
    await reportActual(SEED.buyOpen, C, { actualFen: 450, photoUrl: photo });
    await expect(confirmBudget(SEED.buyOpen, A)).rejects.toThrow(/发布者/);
  });
});
