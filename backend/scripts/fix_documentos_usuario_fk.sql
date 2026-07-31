SET @documentos_table = (
  SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND LOWER(TABLE_NAME) = LOWER('Documentos')
   ORDER BY CASE WHEN TABLE_NAME = 'Documentos' THEN 0 ELSE 1 END
   LIMIT 1
);

SET @contratos_table = (
  SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND LOWER(TABLE_NAME) = LOWER('Contratos')
   ORDER BY CASE WHEN TABLE_NAME = 'Contratos' THEN 0 ELSE 1 END
   LIMIT 1
);

SET @usuarios_table = (
  SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND LOWER(TABLE_NAME) = LOWER('usuarios')
   ORDER BY CASE WHEN TABLE_NAME = 'usuarios' THEN 0 ELSE 1 END
   LIMIT 1
);

SET @missing_tables = CONCAT_WS(
  ', ',
  IF(@documentos_table IS NULL, 'Documentos', NULL),
  IF(@contratos_table IS NULL, 'Contratos', NULL),
  IF(@usuarios_table IS NULL, 'usuarios', NULL)
);

SET @sql = IF(
  @missing_tables <> '',
  CONCAT('SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Tabelas ausentes: ', @missing_tables, ''''),
  'SELECT ''Tabelas encontradas'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @doc_usuario_col = (
  SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @documentos_table
     AND LOWER(COLUMN_NAME) IN ('usuario_id', 'usuarioid')
   ORDER BY FIELD(LOWER(COLUMN_NAME), 'usuario_id', 'usuarioid')
   LIMIT 1
);

SET @doc_contrato_col = (
  SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @documentos_table
     AND LOWER(COLUMN_NAME) IN ('contrato_id', 'contratoid')
   ORDER BY FIELD(LOWER(COLUMN_NAME), 'contrato_id', 'contratoid')
   LIMIT 1
);

SET @contrato_id_col = (
  SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table
     AND LOWER(COLUMN_NAME) IN ('contrato_id', 'id')
   ORDER BY FIELD(LOWER(COLUMN_NAME), 'contrato_id', 'id')
   LIMIT 1
);

SET @contrato_login_col = (
  SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table
     AND LOWER(COLUMN_NAME) IN ('usuario_login', 'login', 'usuario', 'user_login')
   ORDER BY FIELD(LOWER(COLUMN_NAME), 'usuario_login', 'login', 'usuario', 'user_login')
   LIMIT 1
);

SET @usuario_id_col = (
  SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @usuarios_table
     AND LOWER(COLUMN_NAME) IN ('usuario_id', 'id')
   ORDER BY FIELD(LOWER(COLUMN_NAME), 'usuario_id', 'id')
   LIMIT 1
);

SET @usuario_login_col = (
  SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @usuarios_table
     AND LOWER(COLUMN_NAME) IN ('usuario_login', 'login')
   ORDER BY FIELD(LOWER(COLUMN_NAME), 'usuario_login', 'login')
   LIMIT 1
);

SET @missing_columns = CONCAT_WS(
  ', ',
  IF(@doc_usuario_col IS NULL, 'Documentos.Usuario_ID', NULL),
  IF(@doc_contrato_col IS NULL, 'Documentos.Contrato_ID', NULL),
  IF(@contrato_id_col IS NULL, 'Contratos.Contrato_ID', NULL),
  IF(@contrato_login_col IS NULL, 'Contratos.Usuario_Login', NULL),
  IF(@usuario_id_col IS NULL, 'usuarios.usuario_id', NULL),
  IF(@usuario_login_col IS NULL, 'usuarios.usuario_login', NULL)
);

SET @sql = IF(
  @missing_columns <> '',
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Colunas obrigatorias ausentes para ajustar FK.''',
  'SELECT ''Colunas encontradas'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @documentos_table_q = CONCAT('`', REPLACE(@documentos_table, '`', '``'), '`');
SET @contratos_table_q = CONCAT('`', REPLACE(@contratos_table, '`', '``'), '`');
SET @usuarios_table_q = CONCAT('`', REPLACE(@usuarios_table, '`', '``'), '`');
SET @doc_usuario_col_q = CONCAT('`', REPLACE(@doc_usuario_col, '`', '``'), '`');
SET @doc_contrato_col_q = CONCAT('`', REPLACE(@doc_contrato_col, '`', '``'), '`');
SET @contrato_id_col_q = CONCAT('`', REPLACE(@contrato_id_col, '`', '``'), '`');
SET @contrato_login_col_q = CONCAT('`', REPLACE(@contrato_login_col, '`', '``'), '`');
SET @usuario_id_col_q = CONCAT('`', REPLACE(@usuario_id_col, '`', '``'), '`');
SET @usuario_login_col_q = CONCAT('`', REPLACE(@usuario_login_col, '`', '``'), '`');

SET @old_fk_name = (
  SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @documentos_table
     AND COLUMN_NAME = @doc_usuario_col
     AND REFERENCED_TABLE_NAME IS NOT NULL
   LIMIT 1
);

SET @old_fk_name_q = CONCAT('`', REPLACE(@old_fk_name, '`', '``'), '`');
SET @sql = IF(
  @old_fk_name IS NULL,
  'SELECT ''Nenhuma FK antiga encontrada em Documentos.Usuario_ID'' AS status',
  CONCAT('ALTER TABLE ', @documentos_table_q, ' DROP FOREIGN KEY ', @old_fk_name_q)
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @usuario_id_type = (
  SELECT COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @usuarios_table
     AND COLUMN_NAME = @usuario_id_col
   LIMIT 1
);

SET @sql = CONCAT(
  'ALTER TABLE ', @documentos_table_q,
  ' MODIFY COLUMN ', @doc_usuario_col_q, ' ', @usuario_id_type, ' NOT NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @doc_usuario_index_count = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @documentos_table
     AND COLUMN_NAME = @doc_usuario_col
);

SET @sql = IF(
  @doc_usuario_index_count > 0,
  'SELECT ''Documentos.Usuario_ID ja possui indice'' AS status',
  CONCAT('ALTER TABLE ', @documentos_table_q, ' ADD INDEX idx_documentos_usuario_fk (', @doc_usuario_col_q, ')')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @usuario_id_index_count = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @usuarios_table
     AND COLUMN_NAME = @usuario_id_col
);

SET @sql = IF(
  @usuario_id_index_count > 0,
  'SELECT ''usuarios.usuario_id ja possui indice'' AS status',
  CONCAT('ALTER TABLE ', @usuarios_table_q, ' ADD INDEX idx_usuarios_documentos_fk (', @usuario_id_col_q, ')')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = CONCAT(
  'UPDATE ', @documentos_table_q, ' d ',
  'JOIN ', @contratos_table_q, ' c ON d.', @doc_contrato_col_q, ' = c.', @contrato_id_col_q, ' ',
  'JOIN ', @usuarios_table_q, ' u ON LOWER(TRIM(u.', @usuario_login_col_q, ')) = LOWER(TRIM(c.', @contrato_login_col_q, ')) ',
  'SET d.', @doc_usuario_col_q, ' = u.', @usuario_id_col_q
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = CONCAT(
  'SELECT COUNT(*) INTO @documentos_sem_usuario ',
  'FROM ', @documentos_table_q, ' d ',
  'LEFT JOIN ', @usuarios_table_q, ' u ON d.', @doc_usuario_col_q, ' = u.', @usuario_id_col_q, ' ',
  'WHERE u.', @usuario_id_col_q, ' IS NULL'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  @documentos_sem_usuario > 0,
  'SIGNAL SQLSTATE ''45000'' SET MESSAGE_TEXT = ''Existem documentos sem usuario correspondente.''',
  'SELECT ''Todos os documentos possuem usuario correspondente'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @new_fk_exists = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @documentos_table
     AND COLUMN_NAME = @doc_usuario_col
     AND REFERENCED_TABLE_NAME = @usuarios_table
     AND REFERENCED_COLUMN_NAME = @usuario_id_col
);

SET @sql = IF(
  @new_fk_exists > 0,
  'SELECT ''FK de Documentos para usuarios ja esta correta'' AS status',
  CONCAT(
    'ALTER TABLE ', @documentos_table_q,
    ' ADD CONSTRAINT fk_mph_doc_usuario FOREIGN KEY (', @doc_usuario_col_q, ') ',
    'REFERENCES ', @usuarios_table_q, ' (', @usuario_id_col_q, ') ON DELETE CASCADE'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
