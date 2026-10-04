-- Direct stock mode: finished goods (bread, donuts, bottled drinks) are counted
-- by hand instead of being derived from a recipe. Replaces the hardcoded
-- "Bread & Pastries" string check with a real flag, so any number of categories
-- can be counted directly.
--
-- Applied to the live database as targeted DDL through the MySQL connection, NOT
-- via `prisma db push` — push wants to drop MenuCategory.station (still present
-- in the live schema but no longer declared in schema.prisma) and the BAR role
-- value. This folder exists so the change is on the record. Purely additive:
-- every column has a default, so existing rows and older code keep working.

ALTER TABLE `MenuCategory` ADD COLUMN `tracksStockDirectly` BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE `MenuItem` ADD COLUMN `stockMode` ENUM('RECIPE','DIRECT') NOT NULL DEFAULT 'RECIPE';
ALTER TABLE `MenuItem` ADD COLUMN `lowStockAt` INT NOT NULL DEFAULT 0;
ALTER TABLE `MenuItem` ADD COLUMN `unitLabel` VARCHAR(191) NOT NULL DEFAULT 'pcs';

-- Backfill: the Bread & Pastries preview becomes the first real counted
-- category. MenuItem.stockQuantity already held the counts a supervisor typed
-- during the preview, so it is left as-is and becomes the live number.
UPDATE `MenuCategory` SET `tracksStockDirectly` = TRUE WHERE `name` = 'Bread & Pastries';

UPDATE `MenuItem` m
  JOIN `MenuCategory` c ON c.`id` = m.`categoryId`
  SET m.`stockMode` = 'DIRECT', m.`lowStockAt` = 10, m.`unitLabel` = 'pcs'
  WHERE c.`name` = 'Bread & Pastries';
