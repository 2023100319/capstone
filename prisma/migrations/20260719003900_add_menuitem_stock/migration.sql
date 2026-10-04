-- Per-product stock on MenuItem. Deducted on payment; item shows "Sold Out" at 0.
ALTER TABLE `MenuItem` ADD COLUMN `stockQuantity` INTEGER NOT NULL DEFAULT 0;

-- Existing products get a starter stock so the current menu isn't all sold out.
UPDATE `MenuItem` SET `stockQuantity` = 50;
