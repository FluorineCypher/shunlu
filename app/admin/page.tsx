import { redirect } from "next/navigation";

/**
 * v1.8（m03494）：手机版看板下线。
 *
 * 管理员的唯一入口改为电脑端密码后台 `/admin/console`（不依赖切号、口令守卫）。
 * 旧地址保留重定向，避免演示时手输 `/admin` 得到 404。
 */
export const dynamic = "force-dynamic";

export default function AdminPage() {
  redirect("/admin/console");
}
