ALTER TABLE "categories" ADD COLUMN "parent_category_id" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "youtube_playlist_id" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "last_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_category_id_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_categories_parent_id" ON "categories" USING btree ("parent_category_id");