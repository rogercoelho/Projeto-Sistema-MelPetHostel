SET @has_tempo_quantidade := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'tempo_quantidade'
);

SET @sql := IF(
  @has_tempo_quantidade = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `tempo_quantidade` INT NOT NULL DEFAULT 1 AFTER `plano_id`',
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` MODIFY COLUMN `tempo_quantidade` INT NOT NULL DEFAULT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_modo_cobranca := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'modo_cobranca'
);

SET @sql := IF(
  @has_modo_cobranca = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `modo_cobranca` VARCHAR(30) NOT NULL DEFAULT ''unico'' AFTER `plano_id`',
  'SELECT ''Hospedagem_Solicitacao_Itens.modo_cobranca ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_tempo_unidade := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'tempo_unidade'
);

SET @sql := IF(
  @has_tempo_unidade = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `tempo_unidade` VARCHAR(40) NOT NULL DEFAULT ''dia'' AFTER `tempo_quantidade`',
  'SELECT ''Hospedagem_Solicitacao_Itens.tempo_unidade ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_inicio_mes := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacao_Itens'
    AND COLUMN_NAME = 'inicio_mes'
);

SET @sql := IF(
  @has_inicio_mes = 0,
  'ALTER TABLE `Hospedagem_Solicitacao_Itens` ADD COLUMN `inicio_mes` CHAR(7) NULL DEFAULT NULL AFTER `tempo_unidade`',
  'SELECT ''Hospedagem_Solicitacao_Itens.inicio_mes ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `Hospedagem_Solicitacao_Itens`
  MODIFY COLUMN `data_saida` DATE NULL DEFAULT NULL;

UPDATE `Hospedagem_Solicitacao_Itens`
   SET `modo_cobranca` = 'unico'
 WHERE `modo_cobranca` IS NULL
    OR `modo_cobranca` = ''
    OR `modo_cobranca` = 'diaria'
    OR `modo_cobranca` = 'semanal';

SET @has_solic_modo_cobranca := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacoes'
    AND COLUMN_NAME = 'modo_cobranca'
);

SET @sql := IF(
  @has_solic_modo_cobranca = 0,
  'ALTER TABLE `Hospedagem_Solicitacoes` ADD COLUMN `modo_cobranca` VARCHAR(30) NOT NULL DEFAULT ''unico'' AFTER `tipo`',
  'SELECT ''Hospedagem_Solicitacoes.modo_cobranca ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_solic_inicio_mes := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Solicitacoes'
    AND COLUMN_NAME = 'inicio_mes'
);

SET @sql := IF(
  @has_solic_inicio_mes = 0,
  'ALTER TABLE `Hospedagem_Solicitacoes` ADD COLUMN `inicio_mes` CHAR(7) NULL DEFAULT NULL AFTER `modo_cobranca`',
  'SELECT ''Hospedagem_Solicitacoes.inicio_mes ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE `Hospedagem_Solicitacoes`
  MODIFY COLUMN `data_saida` DATE NULL DEFAULT NULL;

UPDATE `Hospedagem_Solicitacoes`
   SET `modo_cobranca` = 'unico'
 WHERE `modo_cobranca` IS NULL
    OR `modo_cobranca` = ''
    OR `modo_cobranca` = 'diaria'
    OR `modo_cobranca` = 'semanal';
