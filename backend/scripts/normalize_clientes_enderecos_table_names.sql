SET @has_clientes_lower := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND BINARY TABLE_NAME = 'clientes'
);

SET @has_clientes_official := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND BINARY TABLE_NAME = 'Clientes'
);

SET @sql := IF(
  @has_clientes_lower > 0 AND @has_clientes_official > 0,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Existem as tabelas clientes e Clientes. Unifique os dados manualmente antes de continuar.''',
  'SELECT ''Clientes sem conflito'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_clientes_lower > 0 AND @has_clientes_official = 0,
  'RENAME TABLE `clientes` TO `Clientes`',
  'SELECT ''Tabela Clientes ja esta com nome oficial'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_enderecos_lower := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND BINARY TABLE_NAME = 'enderecos'
);

SET @has_enderecos_official := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND BINARY TABLE_NAME = 'Enderecos'
);

SET @sql := IF(
  @has_enderecos_lower > 0 AND @has_enderecos_official > 0,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Existem as tabelas enderecos e Enderecos. Unifique os dados manualmente antes de continuar.''',
  'SELECT ''Enderecos sem conflito'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_enderecos_lower > 0 AND @has_enderecos_official = 0,
  'RENAME TABLE `enderecos` TO `Enderecos`',
  'SELECT ''Tabela Enderecos ja esta com nome oficial'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;