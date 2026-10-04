-- Sales-import audit log. New table + nullable FK → additive and backward-
-- compatible with the other apps sharing this DB. Applied directly to the live
-- Aiven DB on 2026-07-24 (not via `prisma migrate dev`, to avoid the pending
-- station/bar drift); recorded here for history.
CREATE TABLE `ImportLog` (
  `id` VARCHAR(191) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `rowCount` INT NOT NULL,
  `appliedCount` INT NOT NULL,
  `skippedCount` INT NOT NULL,
  `totalUnits` INT NOT NULL,
  `details` JSON NULL,
  `uploadedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `ImportLog_uploadedById_idx` (`uploadedById`),
  INDEX `ImportLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `ImportLog_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
