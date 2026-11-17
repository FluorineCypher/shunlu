/**
 * 本机内嵌 PostgreSQL（Postgres 16 二进制随 devDependency 下载，无需 Docker/管理员权限）。
 *
 * 定位（AGENTS.md §2）：Neon 仍是主库；本脚本只是「无网 / 未配置 Neon 时」的等价备份，
 * 两者 schema 完全一致（同一套 Drizzle 迁移）。DATABASE_URL 指向哪里，应用就连哪里。
 *
 * 用法：
 *   npm run db:local        # 前台启动，Ctrl+C 停止（数据留在 .data/pg）
 *   npm run dev / start     # 若 DATABASE_URL 指向 127.0.0.1:55432，会自动拉起本库
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

export const LOCAL_DB = {
  port: 55432,
  database: "shunlu",
  user: "postgres",
  password: "postgres",
  dir: path.join(process.cwd(), ".data", "pg"),
};

export function localDatabaseUrl() {
  return `postgres://${LOCAL_DB.user}:${LOCAL_DB.password}@127.0.0.1:${LOCAL_DB.port}/${LOCAL_DB.database}`;
}

/** DATABASE_URL 是否指向本机内嵌库（只有这种情况才自动拉起） */
export function pointsToLocalDb(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
      (u.port === String(LOCAL_DB.port) || u.port === "")
    );
  } catch {
    return false;
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

let instance = null;

/**
 * 确保本机库已启动（幂等）：已启动则直接返回；否则初始化数据目录并 start。
 * 返回 EmbeddedPostgres 实例（由当前进程持有，进程退出时自动停库；数据保留）。
 */
export async function ensureLocalDb({ quiet = false } = {}) {
  if (instance) return instance;
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  if (await isPortOpen(LOCAL_DB.port)) {
    log(`[local-db] 已检测到 127.0.0.1:${LOCAL_DB.port} 上的数据库，直接复用`);
    return null;
  }

  const pg = new EmbeddedPostgres({
    databaseDir: LOCAL_DB.dir,
    port: LOCAL_DB.port,
    user: LOCAL_DB.user,
    password: LOCAL_DB.password,
    persistent: true,
    onLog: () => {},
    onError: (e) => console.error("[local-db]", e),
  });

  if (!fs.existsSync(path.join(LOCAL_DB.dir, "PG_VERSION"))) {
    log("[local-db] 首次初始化数据目录 .data/pg …");
    await pg.initialise();
  }

  await pg.start();
  try {
    await pg.createDatabase(LOCAL_DB.database);
    log(`[local-db] 已创建数据库 ${LOCAL_DB.database}`);
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (!/already exists/i.test(msg)) throw err;
  }

  instance = pg;
  log(`[local-db] 已启动 postgres 16 → ${localDatabaseUrl()}`);
  return pg;
}

// 直接运行时：前台守护，Ctrl+C 退出
if (process.argv[1] && process.argv[1].endsWith("local-db.mjs")) {
  ensureLocalDb()
    .then(() => {
      console.log("[local-db] 按 Ctrl+C 停止");
      setInterval(() => {}, 1 << 30);
    })
    .catch((err) => {
      console.error("[local-db] 启动失败：", err);
      process.exit(1);
    });
}
