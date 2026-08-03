CREATE TABLE IF NOT EXISTS `Planos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tipo` VARCHAR(120) NOT NULL,
  `categoria_de` VARCHAR(120) NOT NULL,
  `categoria_ate` VARCHAR(120) NOT NULL,
  `unidade` VARCHAR(20) NOT NULL DEFAULT 'Kg',
  `tipo_cobranca` VARCHAR(30) NOT NULL DEFAULT 'unico',
  `tipo_calculo` VARCHAR(30) NOT NULL DEFAULT 'pernoite',
  `tempo_quantidade` INT NOT NULL DEFAULT 1,
  `tempo_unidade` VARCHAR(40) NOT NULL DEFAULT 'dia',
  `valor` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_planos_tipo` (`tipo`),
  INDEX `idx_planos_ativo` (`ativo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
