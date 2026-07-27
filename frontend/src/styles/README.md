Guia de estilos - tokens e responsividade

Objetivo

- Centralizar tokens (cores, espaçamentos, raios e sombras) em `tokens.css`.
- Definir breakpoints e exemplo de uso para componentes.

Breakpoints (mobile-first)

- Mobile (pequeno): max-width: 479px
- Tablet: min-width: 480px and max-width: 767px
- Desktop: min-width: 768px

Tokens disponíveis (em `src/styles/tokens.css`)

- Cores: `--cor-marrom`, `--cor-areia`, `--cor-erro`, `--cor-sucesso`, etc.
- Espaçamento: `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`.
- Bordas: `--radius-sm`, `--radius-md`, `--radius-lg`.
- Sombreamento: `--shadow-sm`, `--shadow-md`, `--shadow-lg`.

Boas práticas de responsividade

- Use valores percentuais ou `width: 100%` para elementos principais em mobile.
- Use `box-sizing: border-box` em componentes para evitar overflow ao incluir padding/border.
- Preferir mobile-first: definir estilo base para mobile e aumentar com `@media (min-width: 480px)` e `@media (min-width: 768px)`.
- Utilize classes utilitárias (`.container`, `.grid`, `.grid-2`, `.grid-3`) para layouts responsivos.

Exemplos

- Botão que ocupa largura total em mobile:
  - HTML: `<button class="btn btn-primary btn-full">Ação</button>`
  - CSS: `.btn-full { width: 100%; }` (já disponível)

- Card responsivo:
  - Use `.card` (width 100%) e, em telas maiores, `grid-2` para exibir múltiplas colunas.

Próximos passos recomendados

- Atualizar outros componentes (`Modal`, `Input`, `Alert`, `Card`, `Button`) para usar tokens — já aplicados alguns ajustes.
- Adotar CSS Modules para encapsular estilos quando compor componentes maiores.
- Rodar testes manuais em dispositivos (mobile/desktop) e ajustar espaçamentos específicos conforme necessidade.

Se quiser, posso:

- aplicar as mesmas melhorias em `Modal`, `Input`, `Alert` (já feitas); posso estender para `Card`, `Button` adicionais ou migrar para CSS Modules.
- criar snippets de componente `Button` e `Card` com props CSS Modules para referência.
