-- Two client requests landed together on 2026-09-13, and both need a column:
--
-- 1. Bar and kitchen inventory are shown separately again. The tag lives on
--    InventoryCategory this time (which prep area stocks it), not on
--    MenuCategory like the pre-July station column — the old one routed orders
--    to prep screens; this one just groups ingredients. Coffee/Syrups/
--    Sweeteners move to BAR, everything else stays KITCHEN.
--
-- 2. RecipeItem gains variationLabel, so a menu item's ingredients can differ
--    per variation ("" stays the recipe of items with no variations). Existing
--    recipes of variation items are copied onto every one of their variations —
--    the old code deducted the same flat recipe no matter which variation sold,
--    so the copies preserve exactly that behaviour until the client edits them —
--    then the flat rows go. The Excel sales import gains a Variation column and
--    skips variation-item rows without one ("needs variation") rather than
--    guessing a recipe.
--
-- Applied by hand with scripts/apply-migration.mts because the mysql MCP
-- server's parser cannot read JSON_TABLE. Recorded with
-- `prisma migrate resolve --applied` afterwards.
--
-- Statement order note: the backfill INSERT runs AFTER dropping the old
-- (menuItemId, inventoryItemId) unique index, not before — copying one recipe
-- onto several variations necessarily repeats that pair, and the first run hit
-- exactly that. Statements 1–3 went in before the reorder; the rest ran in the
-- order below.

-- Data/scope step: tag the coffee-bar categories before anything reads them.
ALTER TABLE `InventoryCategory`
  ADD COLUMN `station` ENUM('BAR', 'KITCHEN') NOT NULL DEFAULT 'KITCHEN';

UPDATE `InventoryCategory`
SET `station` = 'BAR'
WHERE `name` IN ('Coffee', 'Syrups', 'Sweeteners');

-- The variation dimension on recipes. "" keeps meaning "no variation", so every
-- existing row — and every item without variations — is already correct.
ALTER TABLE `RecipeItem`
  ADD COLUMN `variationLabel` VARCHAR(191) NOT NULL DEFAULT '';

-- The old pair-wide index must go first: the backfill copies one recipe onto
-- several variations, which repeats (menuItemId, inventoryItemId) by design.
-- MySQL refuses to drop it while the menuItemId foreign key relies on it, so a
-- temporary replacement index goes in first — and comes off again at the end,
-- once the new unique index (which also starts with menuItemId) can take over.
ALTER TABLE `RecipeItem`
  ADD INDEX `RecipeItem_menuItemId_idx_tmp` (`menuItemId`);

ALTER TABLE `RecipeItem`
  DROP INDEX `RecipeItem_menuItemId_inventoryItemId_key`;

-- Copy each variation item's recipe onto every one of its variations. JSON_TABLE
-- expands the variations array; ORDINALITY keeps ids unique even if two
-- variations somehow shared a label.
INSERT INTO `RecipeItem` (`id`, `menuItemId`, `inventoryItemId`, `variationLabel`, `quantity`, `createdAt`, `updatedAt`)
SELECT
  CONCAT(UUID(), '-', jt.`ord`),
  r.`menuItemId`,
  r.`inventoryItemId`,
  jt.`label`,
  r.`quantity`,
  r.`createdAt`,
  r.`updatedAt`
FROM `RecipeItem` r
JOIN `MenuItem` m ON m.`id` = r.`menuItemId` AND m.`hasVariation` = 1
JOIN JSON_TABLE(
  m.`variations`,
  '$[*]' COLUMNS (
    `ord` FOR ORDINALITY,
    `label` VARCHAR(191) PATH '$.label'
  )
) jt
WHERE r.`variationLabel` = '';

-- The flat rows have been copied onto every variation; drop them so the modal
-- and the deduction maths see exactly one ingredient set per variation.
DELETE r FROM `RecipeItem` r
JOIN `MenuItem` m ON m.`id` = r.`menuItemId` AND m.`hasVariation` = 1
WHERE r.`variationLabel` = '';

-- Uniqueness moves from (menuItemId, inventoryItemId) to include the variation —
-- the same ingredient can appear in two variations at different quantities.
ALTER TABLE `RecipeItem`
  ADD UNIQUE INDEX `RecipeItem_menuItemId_variationLabel_inventoryItemId_key`
  (`menuItemId`, `variationLabel`, `inventoryItemId`);

-- The new unique index starts with menuItemId, so the FK is covered again and
-- the temporary index is no longer needed.
ALTER TABLE `RecipeItem`
  DROP INDEX `RecipeItem_menuItemId_idx_tmp`;
