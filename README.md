# Copa Clash — versão 4

Site estático, mobile-first, para administrar uma Copa de Clash Royale com fase de grupos, classificação compacta, vídeos incorporados e mata-mata automático.

## O que esta versão resolve

- **não é mais necessário apagar/recriar o Supabase ao atualizar o site**;
- `js/config.js` continua sendo a configuração principal, mas uma cópia válida da URL/chave pública é salva no `localStorage` do navegador;
- se `config.js` for publicado com placeholder ou ficar preso em cache, o site tenta usar a cópia persistente;
- o Admin também permite informar URL + chave pública diretamente pela tela de conexão;
- `config.js` é carregado com versão na URL (`?v=4`) para reduzir problemas de cache;
- para banco existente, execute apenas a migração incremental `supabase/copa-v3-migration.sql` — não apague o projeto.

## Regras atuais da Copa

Padrão configurado:

- 4 grupos: `1, 2, 3, 4`;
- 5 participantes por grupo;
- 4 classificados por grupo;
- vitória: **+3 pontos**;
- empate: **0 pontos**;
- derrota comum: **0 pontos**;
- derrota por diferença de 3 coroas (0×3): **-1 ponto**.

Critérios de desempate, nesta ordem:

1. pontos;
2. SG (saldo de coroas = coroas feitas - coroas sofridas);
3. menor tempo total das vitórias.

Ao lançar um resultado com vencedor, o Admin pede o tempo no formato `mm:ss`.

## Mata-mata automático

O site público mostra uma **projeção ao vivo** da primeira fase do mata-mata conforme a classificação dos grupos muda. Quando todos os confrontos dos grupos terminam, o Admin grava/sincroniza a chave oficial automaticamente.

Enquanto nenhuma partida eliminatória terminou, correções na classificação podem reposicionar os confrontos. Depois que o mata-mata começa, a chave iniciada fica preservada e os vencedores avançam automaticamente.

Com os grupos `1, 2, 3, 4`, o cruzamento inicial é:

- 1º Grupo 4 × 4º Grupo 1;
- 2º Grupo 4 × 3º Grupo 1;
- 3º Grupo 4 × 2º Grupo 1;
- 4º Grupo 4 × 1º Grupo 1;
- 1º Grupo 3 × 4º Grupo 2;
- 2º Grupo 3 × 3º Grupo 2;
- 3º Grupo 3 × 2º Grupo 2;
- 4º Grupo 3 × 1º Grupo 2.

Depois disso, ao salvar cada resultado do mata-mata, os vencedores são inseridos automaticamente nas quartas, semifinal e final.

O Admin → **Grupos** também possui o botão **Gerar jogos dos grupos**, que cria automaticamente o todos-contra-todos de cada grupo sem duplicar confrontos existentes.

## Vídeos das partidas

Em Admin → **Partidas** você pode cadastrar/editar a URL do vídeo de cada partida. Também é possível salvar o vídeo junto com o resultado.

No site público:

- links compartilháveis de **Google Drive** (`drive.google.com/file/d/...`) são convertidos para o player `/preview` dentro do site;
- YouTube/Shorts e Vimeo são incorporados em player 16:9 responsivo;
- arquivos HTTPS `.mp4`, `.webm` ou `.ogg` usam player nativo;
- outros links HTTPS aparecem como botão externo;
- nada reproduz automaticamente;
- players ficam recolhidos até o visitante tocar em **Assistir**, reduzindo o peso no celular;
- no Drive, o arquivo precisa estar compartilhado com permissão de visualização para o público da Copa.

## Interface mobile

- regras da fase de grupos viraram chips curtos (`4 passam`, `+3 vitória`, `PTS › SG › tempo`);
- no celular, a classificação usa uma lista compacta em vez de tabela larga;
- a fase atual do mata-mata é priorizada no seletor mobile, com opção de abrir a chave completa;
- cards, filtros, navegação inferior e áreas de toque foram reduzidos/ajustados para telas pequenas e safe areas.

## Banco novo

1. Execute `supabase/schema.sql` no SQL Editor.
2. Opcionalmente execute `supabase/copa-2026-dados.sql` para carregar os 20 participantes e os 4 grupos já informados.
3. Crie o usuário do Admin em Supabase Authentication.
4. Execute o comando indicado no final de `schema.sql` para marcar esse usuário como `admin`.

## Banco que já existe

**Não apague o Supabase.**

1. Execute `supabase/copa-v3-migration.sql` uma vez.
2. Se quiser substituir a tabela esportiva da Copa ativa pelos grupos desta edição, execute `supabase/copa-2026-dados.sql`.

`copa-2026-dados.sql` limpa somente partidas e inscrições da **Copa ativa**, preservando o projeto Supabase, autenticação, usuário Admin e aparência do site.

## Grupos prontos no SQL

`supabase/copa-2026-dados.sql` configura:

**Grupo 1:** Marko, Gabriel, Fagner, Alemão, Jorge  
**Grupo 2:** Thiago, Lucas Borba, Emanuel, Josué, Joao Gabriel  
**Grupo 3:** João Beretta, Willian, Felipe, Antony, Miranha  
**Grupo 4:** Ezequiel, Erick, Gustavo Barboza, Victor, Lucas Brum

Depois de executar o SQL, abra Admin → **Grupos** e toque em **Gerar jogos dos grupos** para criar os 40 confrontos (10 por grupo).

## Publicação

A aplicação continua sem build: HTML + CSS + JavaScript no navegador + Supabase. Pode ser publicada como site estático na Vercel/GitHub.

Arquivos principais:

- `index.html` — site público;
- `admin.html` — painel;
- `js/app.js` — classificação, vídeos e visualização pública;
- `js/admin.js` — administração, resultados e avanço automático;
- `js/cup.js` — pontuação, desempates, todos-contra-todos e chaveamento;
- `js/supabase-client.js` — conexão persistente;
- `supabase/schema.sql` — instalação nova;
- `supabase/copa-v3-migration.sql` — atualização do banco existente;
- `supabase/copa-2026-dados.sql` — participantes/grupos solicitados.

## Testes locais

Sem dependências externas:

```bash
node tests/cup.cjs
node tests/media.cjs
node tests/ui.cjs
```
