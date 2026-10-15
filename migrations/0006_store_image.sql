-- Store product images (data URL, ≤256×256, produced client-side —
-- PNG keeps transparency, JPEG for photos).
ALTER TABLE store_products ADD COLUMN image TEXT;
