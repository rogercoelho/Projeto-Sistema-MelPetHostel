ALTER TABLE MelPetHostel_Usuarios
  ADD COLUMN IF NOT EXISTS Grupo_ID INT DEFAULT NULL AFTER Usuario_Senha;

UPDATE MelPetHostel_Usuarios u
JOIN MelPetHostel_Grupos g
  ON g.Grupo_Nome = u.Usuario_Grupo
SET u.Grupo_ID = g.Grupo_ID,
    u.Usuario_Grupo = NULL
WHERE u.Grupo_ID IS NULL
  AND u.Usuario_Grupo IS NOT NULL
  AND TRIM(u.Usuario_Grupo) <> '';

