-- AlterTable
ALTER TABLE `InventoryCategory` ADD COLUMN `archivedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `ActivityLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `actorRole` VARCHAR(191) NOT NULL,
    `area` ENUM('INVENTORY', 'MENU', 'USERS', 'RECIPE', 'IMPORT', 'AUTH') NOT NULL,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'RESTORE', 'STOCK_IN', 'ADJUST', 'WASTAGE', 'EXPIRY', 'IMPORT', 'LOGIN') NOT NULL,
    `targetName` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `detail` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ActivityLog_createdAt_idx`(`createdAt`),
    INDEX `ActivityLog_area_idx`(`area`),
    INDEX `ActivityLog_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ActivityLog` ADD CONSTRAINT `ActivityLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
