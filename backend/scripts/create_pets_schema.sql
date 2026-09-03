SET @clientes_table = (
  SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Clientes'
   LIMIT 1
);

SET @sql = IF(
  @clientes_table IS NULL,
  'CREATE TABLE IF NOT EXISTS `Clientes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `nome` VARCHAR(191) NULL,
    `cpf` VARCHAR(14) NULL,
    `rg` VARCHAR(30) NULL,
    `data_nascimento` DATE NULL,
    `telefone` VARCHAR(30) NULL,
    `whatsapp` VARCHAR(30) NULL,
    `email` VARCHAR(191) NULL,
    `observacoes` TEXT NULL,
    `ativo` TINYINT(1) NOT NULL DEFAULT 1,
    `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `atualizado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT ''Tabela Clientes encontrada'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `Pet_Vacinas_Config` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `descricao` VARCHAR(191) NOT NULL,
  `tipos` TEXT NOT NULL,
  `obrigatorio` TINYINT(1) NOT NULL DEFAULT 0,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_pet_vacinas_config_ativo` (`ativo`),
  INDEX `idx_pet_vacinas_config_obrigatorio` (`obrigatorio`),
  INDEX `idx_pet_vacinas_config_descricao` (`descricao`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @pet_vacinas_config_has_obrigatorio = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pet_Vacinas_Config'
     AND COLUMN_NAME = 'obrigatorio'
);

SET @sql = IF(
  @pet_vacinas_config_has_obrigatorio > 0,
  'SELECT ''Pet_Vacinas_Config.obrigatorio ja existe'' AS status',
  'ALTER TABLE `Pet_Vacinas_Config` ADD COLUMN `obrigatorio` TINYINT(1) NOT NULL DEFAULT 0 AFTER `tipos`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pet_vacinas_config_has_duracao = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pet_Vacinas_Config'
     AND COLUMN_NAME = 'duracao'
);

SET @sql = IF(
  @pet_vacinas_config_has_duracao > 0,
  'ALTER TABLE `Pet_Vacinas_Config` DROP COLUMN `duracao`',
  'SELECT ''Pet_Vacinas_Config.duracao nao existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pet_vacinas_config_has_tipos = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pet_Vacinas_Config'
     AND COLUMN_NAME = 'tipos'
);

SET @sql = IF(
  @pet_vacinas_config_has_tipos > 0,
  'SELECT ''Pet_Vacinas_Config.tipos ja existe'' AS status',
  'ALTER TABLE `Pet_Vacinas_Config` ADD COLUMN `tipos` TEXT NOT NULL AFTER `descricao`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pet_vacinas_config_has_tipos_json = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pet_Vacinas_Config'
     AND COLUMN_NAME = 'tipos_json'
);

SET @sql = IF(
  @pet_vacinas_config_has_tipos_json > 0,
  'ALTER TABLE `Pet_Vacinas_Config` DROP COLUMN `tipos_json`',
  'SELECT ''Pet_Vacinas_Config.tipos_json nao existe'' AS status'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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
  CONCAT('ALTER TABLE ', @clientes_table_q, ' ADD INDEX `idx_clientes_id_pets_fk` (`id`)')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS `Pets` (',
  '`id` INT AUTO_INCREMENT PRIMARY KEY,',
  '`cliente_id` ', @cliente_id_type, ' NOT NULL,',
  '`nome` VARCHAR(160) NOT NULL,',
  '`raca` VARCHAR(120) NOT NULL,',
  '`data_nascimento` DATE NULL,',
  '`peso_aproximado` VARCHAR(60) NOT NULL,',
  '`ativo` TINYINT(1) NOT NULL DEFAULT 1,',
  '`criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '`atualizado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  'INDEX `idx_pets_cliente` (`cliente_id`),',
  'CONSTRAINT `fk_pets_cliente` FOREIGN KEY (`cliente_id`) REFERENCES ',
  @clientes_table_q,
  ' (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- Campo novo: data de nascimento do pet. Idade passa a ser calculada pela aplicacao.
SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Pets'
        AND COLUMN_NAME = 'data_nascimento'
    ),
    'SELECT ''Pets.data_nascimento ja existe'' AS status',
    'ALTER TABLE `Pets` ADD COLUMN `data_nascimento` DATE NULL AFTER `raca`'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Pets'
        AND COLUMN_NAME = 'idade'
    ),
    'ALTER TABLE `Pets` DROP COLUMN `idade`',
    'SELECT ''Pets.idade ja foi removida'' AS status'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `Pet_Fichas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `data_nascimento` DATE NULL,
  `veterinario_nome` VARCHAR(160) NOT NULL,
  `clinica_nome` VARCHAR(160) NOT NULL,
  `clinica_telefone` VARCHAR(40) NOT NULL,
  `clinica_endereco` TEXT NOT NULL,
  `autoriza_atendimento_emergencial` VARCHAR(20) NOT NULL,
  `autoriza_medicacao` VARCHAR(20) NOT NULL,
  `sexo` VARCHAR(20) NOT NULL,
  `castrado` VARCHAR(20) NOT NULL,
  `doenca_diagnosticada` VARCHAR(20) NOT NULL,
  `doenca_detalhes` TEXT NULL,
  `cirurgias_historico` VARCHAR(20) NOT NULL,
  `cirurgias_detalhes` TEXT NULL,
  `medicamento_continuo` VARCHAR(20) NOT NULL,
  `medicamento_detalhes` TEXT NULL,
  `alimentacao_tipos` TEXT NOT NULL,
  `alimentacao_marca` VARCHAR(160) NOT NULL,
  `alimentacao_quantidade_horarios` TEXT NOT NULL,
  `restricoes_alimentares` TEXT NOT NULL,
  `deixa_mexer_potinho` VARCHAR(20) NOT NULL,
  `petiscos` VARCHAR(80) NOT NULL,
  `comportamento_caes` VARCHAR(80) NOT NULL,
  `agressividade` VARCHAR(20) NOT NULL,
  `agressividade_situacoes` TEXT NULL,
  `destroi_objetos` VARCHAR(20) NOT NULL,
  `ansiedade_separacao` VARCHAR(20) NOT NULL,
  `medos_especificos` TEXT NOT NULL,
  `reacao_medo` TEXT NOT NULL,
  `como_acalmar` TEXT NOT NULL,
  `fica_sozinho` VARCHAR(20) NOT NULL,
  `tempo_sozinho` VARCHAR(120) NULL,
  `local_dormir` VARCHAR(200) NOT NULL,
  `ritual_dormir_comer` TEXT NOT NULL,
  `aceita_banho_escovacao` VARCHAR(20) NOT NULL,
  `aceita_roupinha` VARCHAR(20) NOT NULL,
  `permite_manuseio` VARCHAR(20) NOT NULL,
  `gosta_colo` VARCHAR(20) NOT NULL,
  `sensibilidade_fisica` VARCHAR(20) NOT NULL,
  `sensibilidade_detalhes` TEXT NULL,
  `brinca_piscina` VARCHAR(20) NOT NULL,
  `brinca_mangueira` VARCHAR(20) NOT NULL,
  `brinca_bolinha` VARCHAR(20) NOT NULL,
  `brinca_madeira` VARCHAR(20) NOT NULL,
  `observacoes_tutor` TEXT NULL,
  `veracidade_informacoes` TINYINT(1) NOT NULL DEFAULT 0,
  `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_pet_fichas_pet` (`pet_id`),
  CONSTRAINT `fk_pet_fichas_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `Pets` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = (
  SELECT IF(
    EXISTS (
      SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Pet_Fichas'
        AND COLUMN_NAME = 'data_nascimento'
    ),
    'SELECT ''Pet_Fichas.data_nascimento ja existe'' AS status',
    'ALTER TABLE `Pet_Fichas` ADD COLUMN `data_nascimento` DATE NULL AFTER `pet_id`'
  )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `Pet_Fichas` f
INNER JOIN `Pets` p ON p.id = f.pet_id
SET f.`data_nascimento` = p.`data_nascimento`
WHERE f.`data_nascimento` IS NULL
  AND p.`data_nascimento` IS NOT NULL;

SET @sql = CONCAT(
  'CREATE TABLE IF NOT EXISTS `Pet_Carteiras_Vacinacao` (',
  '`id` INT AUTO_INCREMENT PRIMARY KEY,',
  '`pet_id` INT NOT NULL,',
  '`cliente_id` ', @cliente_id_type, ' NOT NULL,',
  '`lado` VARCHAR(20) NOT NULL DEFAULT ''frente'',',
  '`nome_arquivo` VARCHAR(255) NOT NULL,',
  '`file_path` VARCHAR(1024) NOT NULL,',
  '`conferido_at` DATETIME NULL DEFAULT NULL,',
  '`conferido_por` VARCHAR(191) NULL DEFAULT NULL,',
  '`status` VARCHAR(50) NOT NULL DEFAULT ''pendente'',',
  '`motivo_reprovacao` TEXT NULL,',
  '`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,',
  'INDEX `idx_pet_carteiras_pet` (`pet_id`),',
  'INDEX `idx_pet_carteiras_cliente` (`cliente_id`),',
  'INDEX `idx_pet_carteiras_lado` (`pet_id`, `lado`),',
  'INDEX `idx_pet_carteiras_status` (`status`),',
  'CONSTRAINT `fk_pet_carteiras_pet` FOREIGN KEY (`pet_id`) REFERENCES `Pets` (`id`) ON DELETE CASCADE,',
  'CONSTRAINT `fk_pet_carteiras_cliente` FOREIGN KEY (`cliente_id`) REFERENCES ',
  @clientes_table_q,
  ' (`id`) ON DELETE CASCADE',
  ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pet_carteiras_has_lado = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pet_Carteiras_Vacinacao'
     AND COLUMN_NAME = 'lado'
);

SET @sql = IF(
  @pet_carteiras_has_lado > 0,
  'SELECT ''Pet_Carteiras_Vacinacao.lado ja existe'' AS status',
  'ALTER TABLE `Pet_Carteiras_Vacinacao` ADD COLUMN `lado` VARCHAR(20) NOT NULL DEFAULT ''frente'' AFTER `cliente_id`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @pet_carteiras_has_motivo_reprovacao = (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Pet_Carteiras_Vacinacao'
     AND COLUMN_NAME = 'motivo_reprovacao'
);

SET @sql = IF(
  @pet_carteiras_has_motivo_reprovacao > 0,
  'SELECT ''Pet_Carteiras_Vacinacao.motivo_reprovacao ja existe'' AS status',
  'ALTER TABLE `Pet_Carteiras_Vacinacao` ADD COLUMN `motivo_reprovacao` TEXT NULL AFTER `status`'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `Pet_Vacinas_Respostas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pet_id` INT NOT NULL,
  `cliente_id` INT NOT NULL,
  `config_id` INT NOT NULL,
  `valor` VARCHAR(191) NOT NULL,
  `data_aplicacao` DATE NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_pet_vacina_resposta` (`pet_id`, `config_id`),
  INDEX `idx_pet_vacinas_respostas_cliente` (`cliente_id`),
  CONSTRAINT `fk_pet_vacinas_respostas_pet` FOREIGN KEY (`pet_id`)
    REFERENCES `Pets` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_pet_vacinas_respostas_config` FOREIGN KEY (`config_id`)
    REFERENCES `Pet_Vacinas_Config` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
