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

CREATE TABLE IF NOT EXISTS usuarios (
  usuario_id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NULL,
  usuario_login VARCHAR(191) NOT NULL UNIQUE,
  usuario_senha VARCHAR(255) NOT NULL,
  primeiro_acesso TINYINT(1) NOT NULL DEFAULT 1,
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  grupo_id INT NOT NULL,
  INDEX idx_usuarios_cliente_id (cliente_id),
  INDEX idx_usuarios_grupo_id (grupo_id),
  CONSTRAINT fk_usuarios_cliente
    FOREIGN KEY (cliente_id)
    REFERENCES Clientes (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_usuarios_grupo
    FOREIGN KEY (grupo_id)
    REFERENCES Grupos (id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS Contratos (
  Contrato_ID INT AUTO_INCREMENT PRIMARY KEY,
  Usuario_Login VARCHAR(191) NOT NULL,
  Nome_Arquivo VARCHAR(255) DEFAULT NULL,
  File_Path VARCHAR(1024) DEFAULT NULL,
  Conferido TINYINT(1) NOT NULL DEFAULT 0,
  Conferido_At DATETIME NULL DEFAULT NULL,
  Conferido_Por VARCHAR(191) NULL DEFAULT NULL,
  Status VARCHAR(50) NOT NULL DEFAULT 'pendente',
  Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_mph_contratos_login (Usuario_Login),
  INDEX idx_mph_contratos_status (Status),
  INDEX idx_mph_contratos_conferido (Conferido)
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
  Conferido TINYINT(1) NOT NULL DEFAULT 0,
  Conferido_At DATETIME NULL DEFAULT NULL,
  Conferido_Por VARCHAR(191) NULL DEFAULT NULL,
  File_Path VARCHAR(1024) NOT NULL,
  Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mph_doc_usuario FOREIGN KEY (Usuario_ID)
    REFERENCES usuarios (usuario_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_mph_doc_contrato FOREIGN KEY (Contrato_ID)
    REFERENCES Contratos (Contrato_ID)
    ON DELETE CASCADE,
  CONSTRAINT fk_mph_doc_tipo FOREIGN KEY (Documento_Tipo_ID)
    REFERENCES Documentos_Tipo (Id)
    ON DELETE RESTRICT,
  INDEX idx_mph_doc_usuario_contrato_tipo (Usuario_ID, Contrato_ID, Documento_Tipo_ID),
  INDEX idx_mph_doc_conferido (Conferido)
);

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
