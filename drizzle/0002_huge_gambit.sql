CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_categories_user_id" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_videos_user_id" ON "videos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_videos_category_id" ON "videos" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_videos_youtube_id" ON "videos" USING btree ("youtube_id");