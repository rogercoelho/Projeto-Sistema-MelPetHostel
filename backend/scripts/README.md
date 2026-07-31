# Scripts

Scripts mantidos para operacao do Sistema MelPetHostel.

- `npm run db:check`: testa a conexao com o MySQL usando as variaveis `DB_*`.
- `npm run db:setup`: aplica o schema oficial em `create_melpethostel_schema.sql`.
- `npm run db:fix-documentos-fk`: corrige a FK de `Documentos.Usuario_ID` para apontar para `usuarios.usuario_id`.
- `npm run uploads:ensure`: cria as pastas de upload para os grupos cadastrados.

## Telegram

Por padrao, `npm start` inicia a API e o bot Telegram no mesmo processo.

Use `START_BACKGROUND_SERVICES=false` somente se quiser rodar o bot em um
processo separado com:

```bash
npm run telegram:bot
```

O token, o fuso horario, o status ativo/inativo do bot e as notificacoes de
acesso ficam no banco e devem ser gerenciados pela tela de administracao.
