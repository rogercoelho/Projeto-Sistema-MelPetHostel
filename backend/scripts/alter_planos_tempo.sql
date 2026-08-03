SET @has_tempo_quantidade := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'tempo_quantidade'
);

SET @sql := IF(
  @has_tempo_quantidade = 0,
  'ALTER TABLE `Planos` ADD COLUMN `tempo_quantidade` INT NOT NULL DEFAULT 1 AFTER `unidade`',
  'ALTER TABLE `Planos` MODIFY COLUMN `tempo_quantidade` INT NOT NULL DEFAULT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_tipo_cobranca := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'tipo_cobranca'
);

SET @sql := IF(
  @has_tipo_cobranca = 0,
  'ALTER TABLE `Planos` ADD COLUMN `tipo_cobranca` VARCHAR(30) NOT NULL DEFAULT ''unico'' AFTER `unidade`',
  'SELECT ''Planos.tipo_cobranca ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `Planos`
   SET `tipo_cobranca` = 'unico'
 WHERE `tipo_cobranca` IS NULL
    OR `tipo_cobranca` = ''
    OR `tipo_cobranca` = 'diaria'
    OR `tipo_cobranca` = 'semanal';

SET @has_tipo_calculo := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'tipo_calculo'
);

SET @sql := IF(
  @has_tipo_calculo = 0,
  'ALTER TABLE `Planos` ADD COLUMN `tipo_calculo` VARCHAR(30) NOT NULL DEFAULT ''pernoite'' AFTER `tipo_cobranca`',
  'SELECT ''Planos.tipo_calculo ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `Planos`
   SET `tipo_calculo` = 'pernoite'
 WHERE `tipo_calculo` IS NULL
    OR `tipo_calculo` = '';

SET @has_tempo_unidade := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Planos'
    AND COLUMN_NAME = 'tempo_unidade'
);

SET @sql := IF(
  @has_tempo_unidade = 0,
  'ALTER TABLE `Planos` ADD COLUMN `tempo_unidade` VARCHAR(40) NOT NULL DEFAULT ''dia'' AFTER `tempo_quantidade`',
  'SELECT ''Planos.tempo_unidade ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
