SET @contratos_table_name = (
  SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND LOWER(TABLE_NAME) = LOWER('Contratos')
   ORDER BY CASE WHEN TABLE_NAME = 'Contratos' THEN 0 ELSE 1 END
   LIMIT 1
);

SET @contratos_table_exists = IF(@contratos_table_name IS NULL, 0, 1);

SET @contratos_has_conferido_at = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table_name
     AND LOWER(COLUMN_NAME) = LOWER('Conferido_At')
);

SET @sql = IF(
  @contratos_table_exists = 0 OR @contratos_has_conferido_at > 0,
  'SELECT ''Contratos.Conferido_At sem alteracao'' AS status',
  CONCAT('ALTER TABLE `', REPLACE(@contratos_table_name, '`', ''), '` ADD COLUMN `Conferido_At` DATETIME NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contratos_has_conferido_por = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table_name
     AND LOWER(COLUMN_NAME) = LOWER('Conferido_Por')
);

SET @sql = IF(
  @contratos_table_exists = 0 OR @contratos_has_conferido_por > 0,
  'SELECT ''Contratos.Conferido_Por sem alteracao'' AS status',
  CONCAT('ALTER TABLE `', REPLACE(@contratos_table_name, '`', ''), '` ADD COLUMN `Conferido_Por` VARCHAR(191) NULL DEFAULT NULL')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contratos_has_status = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table_name
     AND LOWER(COLUMN_NAME) = LOWER('Status')
);

SET @sql = IF(
  @contratos_table_exists = 0 OR @contratos_has_status > 0,
  'SELECT ''Contratos.Status sem alteracao'' AS status',
  CONCAT('ALTER TABLE `', REPLACE(@contratos_table_name, '`', ''), '` ADD COLUMN `Status` VARCHAR(50) NOT NULL DEFAULT ''pendente''')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @contratos_has_motivo_reprovacao = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table_name
     AND LOWER(COLUMN_NAME) = LOWER('motivo_reprovacao')
);

SET @sql = IF(
  @contratos_table_exists = 0 OR @contratos_has_motivo_reprovacao > 0,
  'SELECT ''Contratos.motivo_reprovacao sem alteracao'' AS status',
  CONCAT('ALTER TABLE `', REPLACE(@contratos_table_name, '`', ''), '` ADD COLUMN `motivo_reprovacao` TEXT NULL')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
SET @contratos_has_status_index = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = @contratos_table_name
     AND INDEX_NAME = 'idx_mph_contratos_status'
);

SET @sql = IF(
  @contratos_table_exists = 0 OR @contratos_has_status_index > 0,
  'SELECT ''idx_mph_contratos_status sem alteracao'' AS status',
  CONCAT('ALTER TABLE `', REPLACE(@contratos_table_name, '`', ''), '` ADD INDEX `idx_mph_contratos_status` (`Status`)')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS Clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(191) NULL,
  cpf VARCHAR(14) NULL,
  rg VARCHAR(30) NULL,
  data_nascimento DATE NULL,
  telefone VARCHAR(30) NULL,
  whatsapp VARCHAR(30) NULL,
  email VARCHAR(191) NULL,
  observacoes TEXT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Grupos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Nome_Grupo VARCHAR(191) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS Usuarios (
  Usuario_ID INT AUTO_INCREMENT PRIMARY KEY,
  Cliente_ID INT NULL,
  Usuario_Login VARCHAR(191) NOT NULL UNIQUE,
  Usuario_Senha VARCHAR(255) NOT NULL,
  Primeiro_Acesso TINYINT(1) NOT NULL DEFAULT 1,
  Ativo TINYINT(1) NOT NULL DEFAULT 1,
  Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  Grupo_ID INT NOT NULL,
  INDEX idx_usuarios_cliente_id (Cliente_ID),
  INDEX idx_usuarios_grupo_id (Grupo_ID),
  CONSTRAINT fk_usuarios_cliente
    FOREIGN KEY (Cliente_ID)
    REFERENCES Clientes (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_usuarios_grupo
    FOREIGN KEY (Grupo_ID)
    REFERENCES Grupos (id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS Contratos (
  Contrato_ID INT AUTO_INCREMENT PRIMARY KEY,
  Usuario_Login VARCHAR(191) NOT NULL,
  Nome_Arquivo VARCHAR(255) DEFAULT NULL,
  File_Path VARCHAR(1024) DEFAULT NULL,
  Conferido_At DATETIME NULL DEFAULT NULL,
  Conferido_Por VARCHAR(191) NULL DEFAULT NULL,
  Status VARCHAR(50) NOT NULL DEFAULT 'pendente',
  motivo_reprovacao TEXT NULL,
  Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mph_contratos_login (Usuario_Login),
  INDEX idx_mph_contratos_status (Status)
);


CREATE TABLE IF NOT EXISTS Documentos_Tipo (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  Documento_Tipo VARCHAR(191) NOT NULL UNIQUE
);

INSERT IGNORE INTO Documentos_Tipo (Id, Documento_Tipo)
VALUES
  (1, 'Documento de Identificacao'),
  (2, 'Comprovante de Endereco'),
  (3, 'Outros Documentos');

CREATE TABLE IF NOT EXISTS Documentos (
  Id INT AUTO_INCREMENT PRIMARY KEY,
  Usuario_ID INT NOT NULL,
  Contrato_ID INT NOT NULL,
  Documento_Tipo_ID INT NOT NULL,
  Conferido_At DATETIME NULL DEFAULT NULL,
  Conferido_Por VARCHAR(191) NULL DEFAULT NULL,
  Status VARCHAR(50) NOT NULL DEFAULT 'pendente',
  motivo_reprovacao TEXT NULL,
  File_Path VARCHAR(1024) NOT NULL,
  Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mph_doc_usuario FOREIGN KEY (Usuario_ID)
    REFERENCES Usuarios (Usuario_ID)
    ON DELETE CASCADE,
  CONSTRAINT fk_mph_doc_contrato FOREIGN KEY (Contrato_ID)
    REFERENCES Contratos (Contrato_ID)
    ON DELETE CASCADE,
  CONSTRAINT fk_mph_doc_tipo FOREIGN KEY (Documento_Tipo_ID)
    REFERENCES Documentos_Tipo (Id)
    ON DELETE RESTRICT,
  INDEX idx_mph_doc_usuario_contrato_tipo (Usuario_ID, Contrato_ID, Documento_Tipo_ID),
  INDEX idx_mph_doc_status (Status)
);

SET @documentos_has_status = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Documentos'
     AND COLUMN_NAME = 'Status'
);

SET @sql = IF(
  @documentos_has_status > 0,
  'SELECT ''Documentos.Status ja existe'' AS status',
  'ALTER TABLE `Documentos` ADD COLUMN `Status` VARCHAR(50) NOT NULL DEFAULT ''pendente'' AFTER `Conferido_Por`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @documentos_has_motivo = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Documentos'
     AND LOWER(COLUMN_NAME) = LOWER('motivo_reprovacao')
);

SET @sql = IF(
  @documentos_has_motivo > 0,
  'SELECT ''Documentos.motivo_reprovacao ja existe'' AS status',
  'ALTER TABLE `Documentos` ADD COLUMN `motivo_reprovacao` TEXT NULL AFTER `Status`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @documentos_has_status_index = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Documentos'
     AND INDEX_NAME = 'idx_mph_doc_status'
);

SET @sql = IF(
  @documentos_has_status_index > 0,
  'SELECT ''Documentos.idx_mph_doc_status ja existe'' AS status',
  'ALTER TABLE `Documentos` ADD INDEX `idx_mph_doc_status` (`Status`)'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS TelegramUsers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(80) NOT NULL DEFAULT 'melpethostel',
  app_user_login VARCHAR(255) NOT NULL,
  telegram_chat_id VARCHAR(50) DEFAULT NULL,
  token VARCHAR(128) DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME DEFAULT NULL,
  UNIQUE KEY uq_mph_tg_user_module (module, app_user_login),
  INDEX idx_mph_tg_chat_id (module, telegram_chat_id),
  INDEX idx_mph_tg_token (module, token),
  INDEX idx_mph_tg_module (module)
);

CREATE TABLE IF NOT EXISTS TelegramBotConfig (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(80) NOT NULL DEFAULT 'melpethostel',
  bot_token VARCHAR(255) NOT NULL,
  bot_username VARCHAR(255) DEFAULT NULL,
  bot_name VARCHAR(255) DEFAULT NULL,
  default_timezone VARCHAR(64) DEFAULT 'America/Sao_Paulo',
  polling_enabled TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  validated_at DATETIME DEFAULT NULL,
  UNIQUE KEY uq_mph_tg_bot_module (module)
);

CREATE TABLE IF NOT EXISTS TelegramModuleNotifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(80) NOT NULL DEFAULT 'melpethostel',
  admin_login VARCHAR(255) DEFAULT NULL,
  admin_logins TEXT DEFAULT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mph_tg_module_notifications_module (module)
);
