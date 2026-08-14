-- Vincula o usuario Quidam a um grupo com Acesso de Administrador.
-- Estrutura real usada: Usuarios.grupo_id -> Grupos.id.

SET @has_acesso := (
  SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'Grupos'
     AND COLUMN_NAME = 'Acesso'
);

SET @sql := IF(
  @has_acesso = 0,
  'ALTER TABLE Grupos ADD COLUMN Acesso ENUM(''adm'', ''usuario'') NOT NULL DEFAULT ''usuario'' AFTER Nome_Grupo',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO Grupos (Nome_Grupo, Acesso)
SELECT 'Administradores', 'adm'
 WHERE NOT EXISTS (
   SELECT 1 FROM Grupos WHERE Nome_Grupo = 'Administradores'
 );

UPDATE Grupos
   SET Acesso = 'adm'
 WHERE Nome_Grupo = 'Administradores';

UPDATE Usuarios u
  JOIN Grupos g ON g.Nome_Grupo = 'Administradores'
   SET u.grupo_id = g.id,
       u.primeiro_acesso = 0
 WHERE LOWER(TRIM(u.usuario_login)) = LOWER('Quidam');