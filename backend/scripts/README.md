# Scripts

Scripts mantidos para operacao do Sistema MelPetHostel.

- `npm start`: inicia a API pelo `server.js`.
- `npm run db:check`: testa a conexao com o MySQL usando as variaveis `DB_*`.
- `npm run db:setup`: aplica o schema oficial em `create_melpethostel_schema.sql`.
- `npm run db:fix-documentos-fk`: corrige a FK de `Documentos.Usuario_ID` para apontar para `usuarios.usuario_id`.
- `npm run uploads:ensure`: cria as pastas de upload para os grupos cadastrados.

## Passenger

Use `server.js` como arquivo de startup do Passenger:

```apache
PassengerStartupFile server.js
```

O `app.js` monta e exporta o Express. O `server.js` inicia a porta, instala os
logs, gerencia desligamento e inicia servicos opcionais.

## Logs

Os logs ficam na pasta `logs/` da API. No servidor de producao, isso resolve
para `/home/goutechc/..sistema-melpethostel_API/logs/`.

- `api-AAAA-MM-DD.log`: entrada e saida das requisicoes.
- `errors-AAAA-MM-DD.log`: erros, alertas e respostas HTTP 4xx/5xx.
- `system-AAAA-MM-DD.log`: startup, shutdown e logs de sistema.

A retencao padrao e de 30 dias. Para alterar, use
`API_LOG_RETENTION_DAYS`.

## Telegram

Por padrao, `npm start` inicia somente a API. O processo web da API nao deve
fazer polling do Telegram em ambientes com Passenger/cPanel.

Rode o bot em apenas um processo separado com:

```bash
npm run telegram:bot
```

O worker possui uma trava interna em `logs/telegram-worker.lock`. Se o cron
tentar iniciar uma segunda instancia enquanto outra ainda estiver ativa, a
segunda sai sem iniciar polling.

Mesmo assim, use `flock` no cron como primeira protecao:

```bash
* * * * * cd /home/goutechc/..sistema-melpethostel_API && flock -n /tmp/melpethostel-telegram.lock npm run telegram:bot >> logs/telegram-cron.log 2>&1
```

Use `START_BACKGROUND_SERVICES=true` somente se precisar iniciar servicos de
background junto da API. Mesmo nesse caso, o processo da API usa o Telegram em
modo envio, sem polling.

O token, o fuso horario, o status ativo/inativo do bot e as notificacoes de
acesso ficam no banco e devem ser gerenciados pela tela de administracao.
