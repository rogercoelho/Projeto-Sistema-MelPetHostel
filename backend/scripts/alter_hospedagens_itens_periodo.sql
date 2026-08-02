SET @has_tipo := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'tipo'
);

SET @sql := IF(
  @has_tipo = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `tipo` VARCHAR(120) NULL AFTER `pet_nome`',
  'SELECT ''Hospedagem_Solicitacao_Itens.tipo ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_data_entrada := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'data_entrada'
);

SET @sql := IF(
  @has_data_entrada = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `data_entrada` DATE NULL AFTER `plano_id`',
  'SELECT ''Hospedagem_Solicitacao_Itens.data_entrada ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_data_saida := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'data_saida'
);

SET @sql := IF(
  @has_data_saida = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `data_saida` DATE NULL AFTER `data_entrada`',
  'SELECT ''Hospedagem_Solicitacao_Itens.data_saida ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_dias := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'dias'
);

SET @sql := IF(
  @has_dias = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `dias` INT NULL AFTER `data_saida`',
  'SELECT ''Hospedagem_Solicitacao_Itens.dias ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
