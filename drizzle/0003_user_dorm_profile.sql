ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dorm_floor" integer;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dorm_room" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_tail" varchar(4);
