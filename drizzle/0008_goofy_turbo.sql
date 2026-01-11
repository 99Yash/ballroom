ALTER TABLE "user"
  ALTER COLUMN "quota_reset_at"
  TYPE timestamptz
  USING "quota_reset_at" AT TIME ZONE 'UTC';

ALTER TABLE "videos"
  ALTER COLUMN "last_seen_at"
  TYPE timestamptz
  USING "last_seen_at" AT TIME ZONE 'UTC';