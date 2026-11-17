import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// drizzle-kit 不读 Next 的 .env.local，这里手动加载（顺序：.env.local 覆盖 .env）
config({ path: [".env.local", ".env"], quiet: true });

export default {
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
