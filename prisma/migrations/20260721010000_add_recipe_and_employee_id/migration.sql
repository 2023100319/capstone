-- Recipe (bill of materials): links a menu item to the ingredients one serving
-- consumes, so paying an order can deduct real ingredient stock.
CREATE TABLE `RecipeItem` (
    `id` VARCHAR(191) NOT NULL,
    `menuItemId` VARCHAR(191) NOT NULL,
    `inventoryItemId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RecipeItem_inventoryItemId_idx`(`inventoryItemId`),
    UNIQUE INDEX `RecipeItem_menuItemId_inventoryItemId_key`(`menuItemId`, `inventoryItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `RecipeItem` ADD CONSTRAINT `RecipeItem_menuItemId_fkey`
    FOREIGN KEY (`menuItemId`) REFERENCES `MenuItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `RecipeItem` ADD CONSTRAINT `RecipeItem_inventoryItemId_fkey`
    FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Employee number on User. Added nullable, backfilled, then made unique + NOT NULL
-- so the existing seeded accounts survive.
ALTER TABLE `User` ADD COLUMN `employeeId` VARCHAR(191) NULL;

SET @row := 0;
UPDATE `User`
SET `employeeId` = CONCAT('EMP-', LPAD((@row := @row + 1), 4, '0'))
ORDER BY `createdAt` ASC, `id` ASC;

ALTER TABLE `User` MODIFY COLUMN `employeeId` VARCHAR(191) NOT NULL;

CREATE UNIQUE INDEX `User_employeeId_key` ON `User`(`employeeId`);
