SET @has_categoria := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'categoria'
);

SET @has_categoria_de := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'categoria_de'
);

SET @sql := IF(
  @has_categoria_de = 0,
  'ALTER TABLE `Planos` ADD COLUMN `categoria_de` VARCHAR(120) NULL AFTER `tipo`',
  'SELECT ''Planos.categoria_de ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_categoria_ate := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'categoria_ate'
);

SET @sql := IF(
  @has_categoria_ate = 0,
  'ALTER TABLE `Planos` ADD COLUMN `categoria_ate` VARCHAR(120) NULL AFTER `categoria_de`',
  'SELECT ''Planos.categoria_ate ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_categoria > 0,
  'UPDATE `Planos`
   SET `categoria_de` = COALESCE(NULLIF(`categoria_de`, ''''), `categoria`),
       `categoria_ate` = COALESCE(NULLIF(`categoria_ate`, ''''), `categoria`)',
  'SELECT ''Planos.categoria nao existe para migrar'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `Planos`
  MODIFY COLUMN `categoria_de` VARCHAR(120) NOT NULL,
  MODIFY COLUMN `categoria_ate` VARCHAR(120) NOT NULL;

SET @has_unidade := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'unidade'
);

SET @sql := IF(
  @has_unidade = 0,
  'ALTER TABLE `Planos` ADD COLUMN `unidade` VARCHAR(20) NOT NULL DEFAULT ''Kg'' AFTER `categoria_ate`',
  'SELECT ''Planos.unidade ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_categoria > 0,
  'ALTER TABLE `Planos` DROP COLUMN `categoria`',
  'SELECT ''Planos.categoria nao existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
