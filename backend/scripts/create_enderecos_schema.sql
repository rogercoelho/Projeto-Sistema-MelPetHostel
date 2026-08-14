SET @clientes_table = (
  SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Clientes'
   LIMIT 1
);

SET @clientes_table_q = CONCAT('`', REPLACE(@clientes_table, '`', '``'), '`');

SET @cliente_id_type = (
  SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @clientes_table
     AND COLUMN_NAME = 'id'
   LIMIT 1
);

SET @sql = CONCAT('ALTER TABLE ', @clientes_table_q, ' ENGINE=InnoDB');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @clientes_id_has_index = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @clientes_table
     AND COLUMN_NAME = 'id'
);

SET @sql = IF(
  @clientes_id_has_index > 0,
  'SELECT ''Clientes.id ja possui indice'' AS status',
  CONCAT('ALTER TABLE ', @clientes_table_q, ' ADD INDEX idx_clientes_id_enderecos_fk (`id`)')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS `Enderecos` (',
  '`id` INT AUTO_INCREMENT PRIMARY KEY,',
  '`cliente_id` ', @cliente_id_type, ' NOT NULL,',
  '`cep` VARCHAR(9) NOT NULL,',
  '`logradouro` VARCHAR(255) NOT NULL,',
  '`numero` VARCHAR(30) NOT NULL,',
  '`complemento` VARCHAR(255) DEFAULT NULL,',
  '`bairro` VARCHAR(120) NOT NULL,',
  '`cidade` VARCHAR(120) NOT NULL,',
  '`estado` VARCHAR(120) DEFAULT NULL,',
  '`uf` CHAR(2) NOT NULL,',
  '`ibge` VARCHAR(20) DEFAULT NULL,',
  '`gia` VARCHAR(20) DEFAULT NULL,',
  '`ddd` VARCHAR(4) DEFAULT NULL,',
  '`siafi` VARCHAR(20) DEFAULT NULL,',
  '`principal` TINYINT(1) NOT NULL DEFAULT 0,',
  '`ativo` TINYINT(1) NOT NULL DEFAULT 1,',
  '`criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '`atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  'INDEX `idx_enderecos_cliente_id` (`cliente_id`),',
  'INDEX `idx_enderecos_cep` (`cep`),',
  'INDEX `idx_enderecos_principal` (`cliente_id`, `principal`),',
  'CONSTRAINT `fk_enderecos_cliente` FOREIGN KEY (`cliente_id`) REFERENCES ',
  @clientes_table_q,
  ' (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
