-- Verifica o acesso do usuario Quidam e do grupo Administradores.

SELECT
  u.usuario_id,
  u.usuario_login,
  u.grupo_id,
  g.Nome_Grupo,
  g.Acesso,
  CASE
    WHEN g.Acesso = 'adm' THEN 'Acesso de Administrador'
    WHEN g.Acesso = 'usuario' THEN 'Acesso de Cliente'
    ELSE 'Acesso invalido ou nao preenchido'
  END AS Acesso_Interpretado
FROM Usuarios u
LEFT JOIN Grupos g ON g.id = u.grupo_id
WHERE LOWER(TRIM(u.usuario_login)) = LOWER('Quidam');

SELECT
  id,
  Nome_Grupo,
  Acesso,
  CASE
    WHEN Acesso = 'adm' THEN 'Acesso de Administrador'
    WHEN Acesso = 'usuario' THEN 'Acesso de Cliente'
    ELSE 'Acesso invalido ou nao preenchido'
  END AS Acesso_Interpretado
FROM Grupos
WHERE Nome_Grupo = 'Administradores';