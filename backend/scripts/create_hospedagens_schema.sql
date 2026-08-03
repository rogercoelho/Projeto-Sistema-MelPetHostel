SET @clientes_table := (
  SELECT TABLE_NAME
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND LOWER(TABLE_NAME) = 'clientes'
  ORDER BY CASE WHEN TABLE_NAME = 'Clientes' THEN 0 ELSE 1 END
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
