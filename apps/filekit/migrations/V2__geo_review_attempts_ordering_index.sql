-- Speeds GeoReview attempt history query:
-- SELECT ... FROM place_geocode_attempts WHERE place_id = ? ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_place_geocode_attempts_place_created_id
ON place_geocode_attempts(place_id, created_at DESC, id DESC);
