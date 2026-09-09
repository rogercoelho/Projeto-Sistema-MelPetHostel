SET @clientes_table := (
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Clientes'
  LIMIT 1
);

SET @pets_table := (
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'pets'
  ORDER BY CASE WHEN TABLE_NAME = 'Pets' THEN 0 ELSE 1 END
  LIMIT 1
);

SET @planos_table := (
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'planos'
  ORDER BY CASE WHEN TABLE_NAME = 'Planos' THEN 0 ELSE 1 END
  LIMIT 1
);

SET @sql := IF(
  @clientes_table IS NULL,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Tabela Clientes nao encontrada''',
  'SELECT ''Tabela Clientes encontrada'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @pets_table IS NULL,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Tabela Pets nao encontrada''',
  'SELECT ''Tabela Pets encontrada'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @planos_table IS NULL,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Tabela Planos nao encontrada''',
  'SELECT ''Tabela Planos encontrada'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @clientes_table_q := CONCAT('`', REPLACE(@clientes_table, '`', '``'), '`');
SET @pets_table_q := CONCAT('`', REPLACE(@pets_table, '`', '``'), '`');
SET @planos_table_q := CONCAT('`', REPLACE(@planos_table, '`', '``'), '`');

SET @cliente_id_type := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @clientes_table
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @pet_id_type := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @pets_table
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @plano_id_type := (
  SELECT COLUMN_TYPE
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @planos_table
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @sql := CONCAT('ALTER TABLE ', @clientes_table_q, ' ENGINE=InnoDB');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT('ALTER TABLE ', @pets_table_q, ' ENGINE=InnoDB');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT('ALTER TABLE ', @planos_table_q, ' ENGINE=InnoDB');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS `Hospedagem_Solicitacoes` (',
  '`id` INT NOT NULL AUTO_INCREMENT,',
  '`cliente_id` ', @cliente_id_type, ' NOT NULL,',
  '`tipo` VARCHAR(120) NOT NULL,',
  '`modo_cobranca` VARCHAR(30) NOT NULL DEFAULT ''unico'',',
  '`inicio_mes` CHAR(7) NULL DEFAULT NULL,',
  '`data_entrada` DATE NOT NULL,',
  '`data_saida` DATE NULL DEFAULT NULL,',
  '`dias` INT NOT NULL,',
  '`valor_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,',
  '`desconto_valor` DECIMAL(10,2) NULL DEFAULT NULL,',
  '`valor_final` DECIMAL(10,2) NULL DEFAULT NULL,',
  '`ajuste_tipo` VARCHAR(20) NULL DEFAULT NULL,',
  '`ajuste_modo` VARCHAR(20) NULL DEFAULT NULL,',
  '`ajuste_valor` DECIMAL(10,2) NULL DEFAULT NULL,',
  '`ajuste_motivo` TEXT NULL,',
  '`status` VARCHAR(30) NOT NULL DEFAULT ''pendente'',',
  '`motivo_recusa` TEXT NULL,',
  '`analisado_por` VARCHAR(191) NULL DEFAULT NULL,',
  '`analisado_em` DATETIME NULL DEFAULT NULL,',
  '`criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '`atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  'PRIMARY KEY (`id`),',
  'INDEX `idx_hosp_solic_cliente` (`cliente_id`),',
  'INDEX `idx_hosp_solic_status` (`status`),',
  'CONSTRAINT `fk_hosp_solic_cliente` FOREIGN KEY (`cliente_id`) REFERENCES ',
  @clientes_table_q,
  ' (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS `Hospedagem_Solicitacao_Itens` (',
  '`id` INT NOT NULL AUTO_INCREMENT,',
  '`solicitacao_id` INT NOT NULL,',
  '`pet_id` ', @pet_id_type, ' NOT NULL,',
  '`pet_nome` VARCHAR(191) NULL DEFAULT NULL,',
  '`tipo` VARCHAR(120) NOT NULL,',
  '`plano_id` ', @plano_id_type, ' NULL DEFAULT NULL,',
  '`modo_cobranca` VARCHAR(30) NOT NULL DEFAULT ''unico'',',
  '`tempo_quantidade` INT NOT NULL DEFAULT 1,',
  '`tempo_unidade` VARCHAR(40) NOT NULL DEFAULT ''dia'',',
  '`inicio_mes` CHAR(7) NULL DEFAULT NULL,',
  '`data_entrada` DATE NOT NULL,',
  '`data_saida` DATE NULL DEFAULT NULL,',
  '`dias` INT NOT NULL,',
  '`valor_diaria` DECIMAL(10,2) NOT NULL DEFAULT 0.00,',
  '`valor_total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,',
  '`criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  'PRIMARY KEY (`id`),',
  'INDEX `idx_hosp_item_solic` (`solicitacao_id`),',
  'INDEX `idx_hosp_item_pet` (`pet_id`),',
  'INDEX `idx_hosp_item_plano` (`plano_id`),',
  'CONSTRAINT `fk_hosp_item_solic` FOREIGN KEY (`solicitacao_id`) REFERENCES `Hospedagem_Solicitacoes` (`id`) ON DELETE CASCADE,',
  'CONSTRAINT `fk_hosp_item_pet` FOREIGN KEY (`pet_id`) REFERENCES ',
  @pets_table_q,
  ' (`id`) ON DELETE CASCADE,',
  'CONSTRAINT `fk_hosp_item_plano` FOREIGN KEY (`plano_id`) REFERENCES ',
  @planos_table_q,
  ' (`id`) ON DELETE SET NULL',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


SET @sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS `MelPet_Pix_Config` (',
  '`id` INT NOT NULL AUTO_INCREMENT,',
  '`chave_pix` VARCHAR(255) NOT NULL,',
  '`nome_recebedor` VARCHAR(120) NOT NULL DEFAULT ''MEL PET HOSTEL'',',
  '`cidade_recebedor` VARCHAR(80) NOT NULL DEFAULT ''SAO PAULO'',',
  '`ativo` TINYINT(1) NOT NULL DEFAULT 1,',
  '`atualizado_por` VARCHAR(191) NULL DEFAULT NULL,',
  '`criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '`atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  'PRIMARY KEY (`id`),',
  'INDEX `idx_melpet_pix_ativo` (`ativo`)',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := CONCAT(
  'CREATE TABLE IF NOT EXISTS `Hospedagem_Pagamentos` (',
  '`id` INT NOT NULL AUTO_INCREMENT,',
  '`solicitacao_id` INT NOT NULL,',
  '`cliente_id` ', @cliente_id_type, ' NOT NULL,',
  '`parcela_tipo` VARCHAR(30) NOT NULL DEFAULT ''total'',',
  '`valor` DECIMAL(10,2) NOT NULL DEFAULT 0.00,',
  '`pix_copia_cola` TEXT NULL,',
  '`qr_code_url` TEXT NULL,',
  '`comprovante_path` VARCHAR(500) NULL DEFAULT NULL,',
  '`comprovante_nome` VARCHAR(255) NULL DEFAULT NULL,',
  '`status` VARCHAR(30) NOT NULL DEFAULT ''aguardando_comprovante'',',
  '`motivo_recusa` TEXT NULL,',
  '`enviado_em` DATETIME NULL DEFAULT NULL,',
  '`conferido_por` VARCHAR(191) NULL DEFAULT NULL,',
  '`conferido_em` DATETIME NULL DEFAULT NULL,',
  '`criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '`atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  'PRIMARY KEY (`id`),',
  'UNIQUE KEY `uk_hosp_pag_solic_parcela` (`solicitacao_id`, `parcela_tipo`),',
  'INDEX `idx_hosp_pag_cliente` (`cliente_id`),',
  'INDEX `idx_hosp_pag_status` (`status`),',
  'CONSTRAINT `fk_hosp_pag_solic` FOREIGN KEY (`solicitacao_id`) REFERENCES `Hospedagem_Solicitacoes` (`id`) ON DELETE CASCADE,',
  'CONSTRAINT `fk_hosp_pag_cliente` FOREIGN KEY (`cliente_id`) REFERENCES ',
  @clientes_table_q,
  ' (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;



SET @hosp_pag_parcela_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Pagamentos'
    AND COLUMN_NAME = 'parcela_tipo'
);
SET @sql := IF(
  @hosp_pag_parcela_col = 0,
  'ALTER TABLE `Hospedagem_Pagamentos` ADD COLUMN `parcela_tipo` VARCHAR(30) NOT NULL DEFAULT ''total'' AFTER `cliente_id`',
  'SELECT ''Coluna parcela_tipo ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;



SET @hosp_pag_motivo_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Pagamentos'
    AND COLUMN_NAME = 'motivo_recusa'
);
SET @sql := IF(
  @hosp_pag_motivo_col = 0,
  'ALTER TABLE `Hospedagem_Pagamentos` ADD COLUMN `motivo_recusa` TEXT NULL AFTER `status`',
  'SELECT ''Coluna motivo_recusa ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @hosp_pag_fk_solic := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Pagamentos'
    AND CONSTRAINT_NAME = 'fk_hosp_pag_solic'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @hosp_pag_fk_solic > 0,
  'ALTER TABLE `Hospedagem_Pagamentos` DROP FOREIGN KEY `fk_hosp_pag_solic`',
  'SELECT ''FK antiga de solicitacao nao encontrada'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @old_hosp_pag_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Pagamentos'
    AND INDEX_NAME = 'uk_hosp_pag_solicitacao'
);
SET @sql := IF(
  @old_hosp_pag_index > 0,
  'ALTER TABLE `Hospedagem_Pagamentos` DROP INDEX `uk_hosp_pag_solicitacao`',
  'SELECT ''Indice antigo de pagamento nao encontrado'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @new_hosp_pag_index := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Pagamentos'
    AND INDEX_NAME = 'uk_hosp_pag_solic_parcela'
);
SET @sql := IF(
  @new_hosp_pag_index = 0,
  'ALTER TABLE `Hospedagem_Pagamentos` ADD UNIQUE KEY `uk_hosp_pag_solic_parcela` (`solicitacao_id`, `parcela_tipo`)',
  'SELECT ''Indice de parcela ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @hosp_pag_fk_solic := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Hospedagem_Pagamentos'
    AND CONSTRAINT_NAME = 'fk_hosp_pag_solic'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(
  @hosp_pag_fk_solic = 0,
  'ALTER TABLE `Hospedagem_Pagamentos` ADD CONSTRAINT `fk_hosp_pag_solic` FOREIGN KEY (`solicitacao_id`) REFERENCES `Hospedagem_Solicitacoes` (`id`) ON DELETE CASCADE',
  'SELECT ''FK de solicitacao ja existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;



