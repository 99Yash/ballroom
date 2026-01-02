CREATE INDEX "idx_videos_user_id_created_at" ON "videos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_videos_user_id_category_id" ON "videos" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "idx_videos_search_vector" ON "videos" USING gin ((
    setweight(to_tsvector('simple', COALESCE("title", '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE("description", '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE("channel_name", '')), 'C')
  ));