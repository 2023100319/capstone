-- Kitchen/Bar merged into a single prep queue: drop the Station concept and the
-- BAR staff role. Data fix runs first so no row is left pointing at a value the
-- narrowed enum no longer allows.

-- Any existing BAR staff become KITCHEN (the single remaining prep role).
UPDATE `User` SET `role` = 'KITCHEN' WHERE `role` = 'BAR';

-- Categories no longer route to a station.
ALTER TABLE `MenuCategory` DROP COLUMN `station`;

-- Remove BAR from the Role enum.
ALTER TABLE `User` MODIFY `role` ENUM('ADMIN', 'OWNER', 'SUPERVISOR', 'CASHIER', 'KITCHEN') NOT NULL DEFAULT 'CASHIER';
