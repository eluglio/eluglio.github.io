ALTER TABLE posts 
    ADD COLUMN IF NOT EXISTS media_url VARCHAR(508),
    ADD COLUMN IF NOT EXISTS media_type VARCHAR(50), -- 'image', 'gif', 'video'
    ADD COLUMN IF NOT EXISTS media_storage VARCHAR(20), -- 's3' | 'external'
    ADD COLUMN IF NOT EXISTS source_url VARCHAR(508),
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8),
    ADD COLUMN IF NOT EXISTS location_accuracy DECIMAL(10, 2);