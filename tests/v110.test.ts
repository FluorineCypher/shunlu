import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { resetAndSeed } from "@/server/demo/seed";
import {
  acceptBatch,
  acceptOrder,
  batchTimeConflict,
  cancelOrder,
  createOrder,
  pickOrder,
  type CreateOrderInput,
} from "@/server/rules/orders";
import { refuseBuy, reportActual } from "@/server/rules/buy";
import { rejectAddons } from "@/server/rules/addons";
import { A, B, C, D, E, SEED, escrowFen, getOrder, getUser, logsOfOrder } from "./helpers";

const F = 10;
const G = 11;

const base: CreateOrderInput = {
  bizType: "food",
  pickupPoint: "东门外卖柜",
  dropBuilding: "女寝3号楼",
  dropFloor: 4,
  dropRoom: "412",
  phoneTail: "8842",
  note: "测试单",
  rewardFen: 300,
};

describe("v1.10 · 性别硬规则（女用户发的单，男跑手一律不能接）", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("男跑手接女生发布的单被拒，女生跑腿者可以接", async () => {
    const order = await createOrder(A, { ...base, dropFloor: 6, dropRoom: "608" });
    await expect(acceptOrder(order.id, F)).rejects.toThrow(/女用户发布.*男用户不可接单/);
    // 被拒后订单仍在架
    expect((await getOrder(order.id)).status).toBe("open");

    const accepted = await acceptOrder(order.id, B);
    expect(accepted.runnerId).toBe(B);
  });

  it("男生发布的单，男跑手可以接（规则只针对女生发的单）", async () => {
    // D 种子里已占满 2 个 open 名额，先取消一单再发
    await cancelOrder(SEED.open1, D);
    const male = await createOrder(D, { ...base, pickupPoint: "西门外卖柜", dropFloor: 3, dropRoom: "305" });
    const accepted = await acceptOrder(male.id, F);
    expect(accepted.runnerId).toBe(F);
  });

  it("批量接单逐单校验性别：混进一单女生单整批失败", async () => {
    await cancelOrder(SEED.open1, D);
    const female = await createOrder(A, { ...base, dropFloor: 6, dropRoom: "608" });
    const male = await createOrder(D, { ...base, pickupPoint: "西门外卖柜", dropFloor: 3, dropRoom: "305" });
    await expect(acceptBatch([female.id, male.id], F)).rejects.toThrow(/女用户发布/);
    expect((await getOrder(female.id)).status).toBe("open");
    expect((await getOrder(male.id)).status).toBe("open");
  });
});

describe("v1.10 · 批次 5 分钟余量校验", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("同一取货点：再多单也不冲突", () => {
    const at = Date.now() + 20 * 60_000;
    const rows = [1, 2, 3, 4].map((i) => ({
      code: `SL-${i}`,
      pickupPoint: "东门外卖柜",
      expectDeliveryAt: new Date(at),
    }));
    expect(batchTimeConflict(rows, Date.now())).toBeNull();
  });

  it("取货点越多越吃时间：3 个点 + 只剩 8 分钟 → 冲突并给出可读提示", () => {
    const nowValue = Date.now();
    const rows = [1, 2, 3].map((i) => ({
      code: `SL-${i}`,
      pickupPoint: `柜${i}`,
      expectDeliveryAt: new Date(nowValue + 8 * 60_000),
    }));
    const msg = batchTimeConflict(rows, nowValue);
    expect(msg).toBeTruthy();
    expect(msg).toContain("不足 5 分钟");
  });

  it("批量接单：8 个不同取货点 → 409 拒绝，一单都没接住", async () => {
    // 发布者同时 open ≤ 2：先取消种子里已占满名额的 D/G 的单，再由 6 个发布者凑 8 单
    await cancelOrder(SEED.open1, D);
    await cancelOrder(SEED.open2, D);
    await cancelOrder(18, G);
    await cancelOrder(20, G);
    const publishers: { id: number; count: number }[] = [
      { id: A, count: 1 },
      { id: C, count: 1 },
      { id: D, count: 2 },
      { id: E, count: 1 },
      { id: F, count: 1 },
      { id: G, count: 2 },
    ];
    const ids: number[] = [];
    let n = 0;
    for (const p of publishers) {
      for (let i = 0; i < p.count; i += 1) {
        n += 1;
        const created = await createOrder(p.id, { ...base, pickupPoint: `取货点${n}` });
        ids.push(created.id);
      }
    }
    expect(ids.length).toBe(8);

    await expect(acceptBatch(ids, B)).rejects.toThrow(/不足 5 分钟/);
    for (const id of ids) {
      const row = await getOrder(id);
      expect(row.status).toBe("open");
      expect(row.runnerId).toBeNull();
    }
  });

  it("批量接单：2 个不同取货点余量充足 → 成功建批", async () => {
    const o1 = await createOrder(B, { ...base, pickupPoint: "东门外卖柜" });
    const o2 = await createOrder(B, { ...base, pickupPoint: "南门外卖柜" });
    const res = await acceptBatch([o1.id, o2.id], C);
    expect(res.batchId).toBeGreaterThan(0);
    expect((await getOrder(o1.id)).batchId).toBe(res.batchId);
  });
});

describe("v1.10 · 代买额度不足：跑腿者拒单 / 拒捎带", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("拒绝代买：整单取消、托管全额退回、跑腿者不扣信用", async () => {
    const before = await getUser(B);
    const accepted = await acceptOrder(SEED.buyOpen, B);
    expect(accepted.status).toBe("accepted");
    const escrowBefore = await escrowFen(SEED.buyOpen);
    expect(escrowBefore).toBe(1300);

    const res = await refuseBuy(SEED.buyOpen, B, "额度不够买整份");
    expect(res.refundedFen).toBe(1300);
    const after = await getOrder(SEED.buyOpen);
    expect(after.status).toBe("cancelled");
    expect(after.runnerId).toBeNull();
    expect(after.cancelReason).toContain("代买额度不足");
    expect(await escrowFen(SEED.buyOpen)).toBe(0);
    expect((await getUser(B)).creditScore).toBe(before.creditScore);
    const logs = await logsOfOrder(SEED.buyOpen);
    expect(logs.some((l) => l.type === "refund" && l.amountFen === 1300)).toBe(true);
  });

  it("拒绝代买的守卫：非接单者 403、已上报实付 409、外卖单不可用", async () => {
    await acceptOrder(SEED.buyOpen, B);
    await expect(refuseBuy(SEED.buyOpen, C)).rejects.toThrow(/只有接单跑腿者/);
    await reportActual(SEED.buyOpen, B, { actualFen: 900, photoUrl: "https://example.com/receipt.jpg" });
    await expect(refuseBuy(SEED.buyOpen, B)).rejects.toThrow(/不能拒绝/);

    await acceptOrder(SEED.open1, B);
    await expect(refuseBuy(SEED.open1, B)).rejects.toThrow(/仅适用于代买订单/);
  });

  it("拒绝捎带：只退捎带预算、外卖单继续送", async () => {
    const order = await getOrder(SEED.open1);
    expect(order.budgetFen).toBeGreaterThan(0);
    await acceptOrder(SEED.open1, B);
    const escrowBefore = await escrowFen(SEED.open1);

    const res = await rejectAddons(SEED.open1, B, "这份预算不够");
    expect(res.refundedFen).toBe(order.budgetFen);
    expect(res.titles.length).toBeGreaterThan(0);

    const after = await getOrder(SEED.open1);
    expect(after.status).toBe("accepted");
    expect(after.runnerId).toBe(B);
    expect(after.budgetFen).toBe(0);
    expect(await escrowFen(SEED.open1)).toBe(escrowBefore - order.budgetFen);

    // 拒绝后可以照常取货送达
    const picked = await pickOrder(SEED.open1, B);
    expect(picked.status).toBe("picked");
  });

  it("拒绝捎带的守卫：非接单者 403、没有 pending 捎带项 409", async () => {
    await acceptOrder(SEED.open1, B);
    await expect(rejectAddons(SEED.open1, C)).rejects.toThrow(/只有接单跑腿者/);
    await rejectAddons(SEED.open1, B);
    await expect(rejectAddons(SEED.open1, B)).rejects.toThrow(/没有待买的捎带项/);
  });
});

describe("v1.10 · 大厅读模型：open 单按接单截止升序", () => {
  beforeEach(async () => {
    await resetAndSeed();
  });

  it("大厅查询按接单截止升序、截止早的先出来", async () => {
    const rows = await db
      .select({ id: orders.id, at: orders.acceptDeadlineAt })
      .from(orders)
      .where(eq(orders.status, "open"))
      .orderBy(orders.acceptDeadlineAt);
    const deadlines = rows.map((r) => r.at?.getTime() ?? Number.POSITIVE_INFINITY);
    const sorted = [...deadlines].sort((a, b) => a - b);
    expect(deadlines).toEqual(sorted);
    expect(rows.length).toBeGreaterThan(2);
  });
});
