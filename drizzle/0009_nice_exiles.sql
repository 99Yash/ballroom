CREATE TYPE "public"."collection_type" AS ENUM('likes', 'bookmarks');--> statement-breakpoint
CREATE TYPE "public"."content_source" AS ENUM('youtube', 'x');--> statement-breakpoint
CREATE TABLE "sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" "content_source" NOT NULL,
	"collection" "collection_type" NOT NULL,
	"cursor" text,
	"last_synced_at" timestamp with time zone,
	"reached_end" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT current_timestamp,
	CONSTRAINT "sync_state_user_source_collection" UNIQUE("user_id","source","collection")
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "source" "content_source" DEFAULT 'youtube' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "collection" "collection_type" DEFAULT 'likes' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "external_id" text;--> statement-breakpoint
UPDATE "videos" SET "external_id" = "youtube_id" WHERE "external_id" IS NULL;--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "external_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "provider_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "sync_state" ADD CONSTRAINT "sync_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_sync_state_user_id" ON "sync_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_videos_user_source" ON "videos" USING btree ("user_id","source");--> statement-breakpoint
CREATE INDEX "idx_videos_user_source_category" ON "videos" USING btree ("user_id","source","category_id");--> statement-breakpoint
CREATE INDEX "idx_videos_user_source_created_at" ON "videos" USING btree ("user_id","source","created_at");--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_source_collection_external_id" UNIQUE("user_id","source","collection","external_id");