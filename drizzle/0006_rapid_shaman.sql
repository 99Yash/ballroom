CREATE TYPE "public"."video_sync_status" AS ENUM('active', 'unliked');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sync_quota_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sync_quota_limit" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "categorize_quota_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "categorize_quota_limit" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "quota_reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "sync_status" "video_sync_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "last_seen_at" timestamp;--> statement-breakpoint
CREATE INDEX "idx_user_quota_reset_at" ON "user" USING btree ("quota_reset_at");--> statement-breakpoint
CREATE INDEX "idx_videos_sync_status" ON "videos" USING btree ("sync_status");--> statement-breakpoint
CREATE INDEX "idx_videos_user_sync_status" ON "videos" USING btree ("user_id","sync_status");