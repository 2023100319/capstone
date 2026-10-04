-- Categories move from hardcoded enums to editable tables, so the owner can add
-- new ones at runtime. Kitchen/bar routing moves onto the category (`station`)
-- so a newly added drink category still reaches the bar.
-- Existing rows are backfilled, then the old enum columns are dropped.

-- CreateTable
CREATE TABLE `MenuCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `station` ENUM('KITCHEN', 'BAR') NOT NULL DEFAULT 'KITCHEN',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MenuCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryCategory` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `InventoryCategory_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed the category rows from the enum values that already exist.
INSERT INTO `MenuCategory` (`id`, `name`, `station`, `sortOrder`) VALUES
    (UUID(), 'Pasta', 'KITCHEN', 1),
    (UUID(), 'Rice Meals', 'KITCHEN', 2),
    (UUID(), 'Pica-Pica / Snacks', 'KITCHEN', 3),
    (UUID(), 'Cakes', 'KITCHEN', 4),
    (UUID(), 'Coffee / Iced Drinks', 'BAR', 5),
    (UUID(), 'Sweet Drinks', 'BAR', 6);

INSERT INTO `InventoryCategory` (`id`, `name`) VALUES
    (UUID(), 'Pasta'),
    (UUID(), 'Dairy'),
    (UUID(), 'Syrups'),
    (UUID(), 'Powders'),
    (UUID(), 'Baking'),
    (UUID(), 'Sweeteners'),
    (UUID(), 'Meat');

-- MenuItem: enum column -> FK, backfilled from the old value.
ALTER TABLE `MenuItem` ADD COLUMN `categoryId` VARCHAR(191) NULL;

UPDATE `MenuItem` mi
JOIN `MenuCategory` mc ON mc.`name` = CASE mi.`category`
    WHEN 'PASTA' THEN 'Pasta'
    WHEN 'RICE_MEALS' THEN 'Rice Meals'
    WHEN 'PICA_PICA' THEN 'Pica-Pica / Snacks'
    WHEN 'CAKES' THEN 'Cakes'
    WHEN 'COFFEE_ICED_DRINKS' THEN 'Coffee / Iced Drinks'
    WHEN 'SWEET_DRINKS' THEN 'Sweet Drinks'
END
SET mi.`categoryId` = mc.`id`;

ALTER TABLE `MenuItem` MODIFY COLUMN `categoryId` VARCHAR(191) NOT NULL;
ALTER TABLE `MenuItem` DROP COLUMN `category`;
CREATE INDEX `MenuItem_categoryId_idx` ON `MenuItem`(`categoryId`);
ALTER TABLE `MenuItem` ADD CONSTRAINT `MenuItem_categoryId_fkey`
    FOREIGN KEY (`categoryId`) REFERENCES `MenuCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- InventoryItem: enum column -> FK, plus a reorder level so status is computed.
ALTER TABLE `InventoryItem` ADD COLUMN `categoryId` VARCHAR(191) NULL;
ALTER TABLE `InventoryItem` ADD COLUMN `reorderLevel` DOUBLE NOT NULL DEFAULT 0;

UPDATE `InventoryItem` ii
JOIN `InventoryCategory` ic ON ic.`name` = CASE ii.`category`
    WHEN 'PASTA' THEN 'Pasta'
    WHEN 'DAIRY' THEN 'Dairy'
    WHEN 'SYRUPS' THEN 'Syrups'
    WHEN 'POWDERS' THEN 'Powders'
    WHEN 'BAKING' THEN 'Baking'
    WHEN 'SWEETENERS' THEN 'Sweeteners'
    WHEN 'MEAT' THEN 'Meat'
END
SET ii.`categoryId` = ic.`id`;

ALTER TABLE `InventoryItem` MODIFY COLUMN `categoryId` VARCHAR(191) NOT NULL;
ALTER TABLE `InventoryItem` DROP COLUMN `category`;
CREATE INDEX `InventoryItem_categoryId_idx` ON `InventoryItem`(`categoryId`);
CREATE INDEX `InventoryItem_updatedById_idx` ON `InventoryItem`(`updatedById`);
ALTER TABLE `InventoryItem` ADD CONSTRAINT `InventoryItem_categoryId_fkey`
    FOREIGN KEY (`categoryId`) REFERENCES `InventoryCategory`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: every "Add Stock" writes one row. This is the source of expenses.
CREATE TABLE `StockPurchase` (
    `id` VARCHAR(191) NOT NULL,
    `inventoryItemId` VARCHAR(191) NOT NULL,
    `quantity` DOUBLE NOT NULL,
    `unitCost` DOUBLE NOT NULL,
    `totalCost` DOUBLE NOT NULL,
    `supplier` VARCHAR(191) NULL,
    `purchasedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockPurchase_inventoryItemId_idx`(`inventoryItemId`),
    INDEX `StockPurchase_purchasedById_idx`(`purchasedById`),
    INDEX `StockPurchase_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StockPurchase` ADD CONSTRAINT `StockPurchase_inventoryItemId_fkey`
    FOREIGN KEY (`inventoryItemId`) REFERENCES `InventoryItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `StockPurchase` ADD CONSTRAINT `StockPurchase_purchasedById_fkey`
    FOREIGN KEY (`purchasedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Reporting indexes.
CREATE INDEX `Order_createdAt_idx` ON `Order`(`createdAt`);
CREATE INDEX `Transaction_cashierId_idx` ON `Transaction`(`cashierId`);
CREATE INDEX `Transaction_createdAt_idx` ON `Transaction`(`createdAt`);
