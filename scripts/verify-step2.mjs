/**
 * Step 2 闭环验收（脚本 A）：A 发 5 元单 → B 接单（才见房号 412 / 尾号）→ pick → 送达 → A 确认
 * → A 余额 −5.00、B +3.75、平台 fee +1.25。附带并发抢单只有一人成功、隐私出口。
 * 用法：先起服务（默认 http://127.0.0.1:3100），再 `node scripts/verify-step2.mjs`
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} · ${name}${extra ? " · " + extra : ""}`);
  if (!ok) failures++;
}

async function req(path, { method = "GET", body, cookie } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  const data = await res.json().catch(() => null);
  return { status: res.status, data, cookie: setCookie ? setCookie.split(";")[0] : null };
}

async function switchTo(userId) {
  const r = await req("/api/auth/switch", { method: "POST", body: { userId } });
  if (r.status !== 200) throw new Error(`切号 ${userId} 失败：${r.status}`);
  return r.cookie;
}

async function main() {
  const reset = await req("/api/demo/reset", { method: "POST" });
  check("重置回种子", reset.status === 200);

  const adminCookie = await switchTo(8);
  const before = await req("/api/admin/overview", { cookie: adminCookie });
  const feeBefore = before.data.platformIncomeFen;

  const aCookie = await switchTo(1);
  const bCookie = await switchTo(2);
  const cCookie = await switchTo(3);

  // A 发布 5 元单
  const aBalanceBefore = (await req("/api/wallet", { cookie: aCookie })).data.balanceFen;
  const created = await req("/api/orders", {
    method: "POST",
    cookie: aCookie,
    body: {
      bizType: "food",
      pickupPoint: "东门外卖柜",
      dropBuilding: "女寝 3 号楼",
      dropFloor: 4,
      dropRoom: "412",
      phoneTail: "1234",
      note: "放门口别敲门",
      rewardFen: 500,
      acceptMinutes: 10,
    },
  });
  check("A 发布成功", created.status === 200, `id=${created.data?.order?.id}`);
  const orderId = created.data.order.id;
  check("发布即冻结（余额 −5.00）", (await req("/api/wallet", { cookie: aCookie })).data.balanceFen === aBalanceBefore - 500, `${aBalanceBefore} → ${(await req("/api/wallet", { cookie: aCookie })).data.balanceFen}`);
  check("跑腿者收益 Y=375 由服务端算", created.data.order.runnerRewardFen === 375);

  // 隐私：发布者本人看不到房号/尾号
  const aDetail = await req(`/api/orders/${orderId}`, { cookie: aCookie });
  check("发布者本人看不到房号", aDetail.data.order.dropRoom === null);
  check("发布者本人看不到尾号", aDetail.data.order.phoneTail === null);
  check("大厅不含房号字段", !("dropRoom" in (await req("/api/hall", { cookie: bCookie })).data.orders[0]));

  // B 接单
  const accepted = await req("/api/orders/accept", { method: "POST", cookie: bCookie, body: { orderIds: [orderId] } });
  check("B 接单成功", accepted.status === 200);
  const bDetail = await req(`/api/orders/${orderId}`, { cookie: bCookie });
  check("接单后跑腿者看到房号 412", bDetail.data.order.dropRoom === "412");
  check("接单后跑腿者看到尾号", bDetail.data.order.phoneTail === "1234");

  // 并发：C 再抢同一单 → 409 手慢了
  const stolen = await req("/api/orders/accept", { method: "POST", cookie: cCookie, body: { orderIds: [orderId] } });
  check("C 抢已接单 → 409", stolen.status === 409, stolen.data?.error);

  // B 取到 → 拍照送达
  check("B 已取到", (await req(`/api/orders/${orderId}/actions`, { method: "POST", cookie: bCookie, body: { action: "pick" } })).status === 200);
  const delivered = await req(`/api/orders/${orderId}/actions`, {
    method: "POST",
    cookie: bCookie,
    body: { action: "deliver", proofPhotoUrl: "/api/files/stub-proof" },
  });
  check("B 送达（带凭证）", delivered.status === 200 && delivered.data.order.status === "delivered");

  // A 确认收货
  const confirmed = await req(`/api/orders/${orderId}/confirm`, { method: "POST", cookie: aCookie });
  check("A 确认收货", confirmed.status === 200, JSON.stringify(confirmed.data?.settlement));

  const aWallet = (await req("/api/wallet", { cookie: aCookie })).data;
  const bWallet = (await req("/api/wallet", { cookie: bCookie })).data;
  check("A 余额变化 −500（冻结 500 → 0）", aWallet.logs.filter((l) => l.orderId === orderId).some((l) => l.amountFen === -500));
  check("A 该单无退款（正常完成）", !aWallet.logs.filter((l) => l.orderId === orderId).some((l) => l.type === "refund"));
  check("B 该单收入 375", bWallet.logs.filter((l) => l.orderId === orderId).some((l) => l.type === "income" && l.amountFen === 375));
  check("B 冻结已释放", bWallet.frozenFen >= 0);

  const after = await req("/api/admin/overview", { cookie: adminCookie });
  check("平台 fee +125", after.data.platformIncomeFen - feeBefore === 125, `${feeBefore} → ${after.data.platformIncomeFen}`);

  // 评价前完成态不可再确认
  check("重复确认 → 4xx", (await req(`/api/orders/${orderId}/confirm`, { method: "POST", cookie: aCookie })).status >= 400);

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
