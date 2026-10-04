-- Add a nullable archive timestamp to MenuCategory so a category (and its items)
-- can be archived instead of deleted. Mirrors InventoryItem.archivedAt.
-- Additive + nullable → backward-compatible with the other apps sharing this DB.
-- Applied directly to the live Aiven DB on 2026-07-24; recorded here for history.
ALTER TABLE `MenuCategory` ADD COLUMN `archivedAt` DATETIME NULL;
