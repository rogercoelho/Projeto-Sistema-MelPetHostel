# Scripts

Scripts mantidos para operacao do Sistema MelPetHostel.

- `npm run db:check`: testa a conexao com o MySQL usando as variaveis `DB_*`.
- `npm run db:setup`: aplica o schema oficial em `create_melpethostel_schema.sql`.
- `npm run db:migrate`: copia os dados MelPetHostel do banco legado para o banco oficial.
- `npm run db:migrate:group-id`: adiciona/preenche `Grupo_ID` em `MelPetHostel_Usuarios`.
- `npm run uploads:ensure`: cria as pastas de upload para os grupos cadastrados.

## Migracao

Antes de rodar `npm run db:migrate`, configure as variaveis `SOURCE_DB_*` com
os dados do banco legado. As variaveis `DB_*` continuam apontando para o banco
oficial do projeto.

Use `npm run db:migrate -- --truncate` somente quando o banco oficial ainda nao
tem dados definitivos e voce quer limpar as tabelas antes da copia.

## Telegram

Por padrao, `npm start` inicia a API e o bot Telegram no mesmo processo.

Use `START_BACKGROUND_SERVICES=false` somente se quiser rodar o bot em um
processo separado com:

```bash
npm run telegram:bot
```

O token, o fuso horario, o status ativo/inativo do bot e as notificacoes de
acesso ficam no banco e devem ser gerenciados pela tela de administracao.
