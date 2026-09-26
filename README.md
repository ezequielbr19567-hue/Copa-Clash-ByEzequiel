# Clash da Turma — versão estática

Site para campeonato em pontos corridos + Copa eliminatória 2v2 de Clash Royale.

## Sem Node.js

Este projeto usa apenas:

- HTML
- CSS
- JavaScript no navegador
- Supabase (banco + login)
- GitHub (arquivos)
- Vercel (hospedagem)

Não há `package.json`, `npm install` ou `npm run dev`.

## Arquivos principais

- `index.html` — site público
- `admin.html` — painel administrativo
- `css/style.css` — visual
- `js/app.js` — classificação, Copa e partidas
- `js/admin.js` — painel administrativo
- `js/config.js` — URL + chave pública do Supabase
- `supabase/schema.sql` — banco, validações e segurança
- `supabase/demo.sql` — dados de exemplo opcionais
- `PASSO_A_PASSO.md` — publicação completa sem terminal

## Regras da liga

Vitória = 3; empate = 1 para cada; derrota = 0; derrota por 0×3 = -1 para o perdedor.

## Copa

Eliminação direta, apenas equipes DUO (2v2), sem empate final.

Leia `PASSO_A_PASSO.md` antes de publicar.

## Personalização e visual mobile

Em bancos já existentes, execute `supabase/site-settings.sql` no SQL Editor. Em bancos novos, `schema.sql` já inclui a configuração.

No Admin, abra **Aparência** para alterar nome, títulos das seções, descrição e rodapé opcionais, imagem por URL HTTPS, cor e visibilidade do destaque. Campos opcionais vazios não aparecem. A imagem original fica em `assets/site-image.png`. As configurações são públicas para leitura e somente administradores podem salvá-las.

A página pública começa vazia até cadastrar os participantes e competições. Não há resultados fictícios como fallback. A classificação mobile mostra posição, participante, jogos, saldo e pontos; **Detalhes** abre todas as colunas. A navegação inferior respeita a área segura do celular. O carregamento acompanha a consulta e tem saída de emergência após 12 segundos.

## Teste de interface (opcional, apenas desenvolvimento)

Com Node.js, Playwright e Microsoft Edge disponíveis, execute `node tests/ui.cjs`. Se o Playwright estiver em outro diretório, configure `NODE_PATH`. O teste usa um servidor local na porta 4173, valida cinco larguras, filtros, pontuação, carregamento com falha e personalização com um backend simulado. As capturas ficam em `test-artifacts/`. Nenhuma credencial ou gravação real é usada. Isso não muda a publicação estática, que continua sem instalação de dependências.

## Revisão visual

Interface inspirada no Clash Royale: azul royal, dourado, placares claros e botões com relevo. A classificação e a Copa ficam lado a lado no desktop e empilhadas no celular. O site usa textos funcionais genéricos, sem slogans ou dados fictícios.

Em **Admin → Aparência**, configure títulos, descrição opcional, imagem, cores principal e de destaque, botão inicial, rótulos do resumo, mensagens de listas vazias, legenda da classificação e rodapé. Valores antigos continuam compatíveis; os campos novos usam padrões até serem salvos. Não é necessária nova migração de banco.

Estudo: [NN/g — AI Prototyping in Real Design Contexts](https://www.nngroup.com/articles/ai-prototyping/). Referência visual: [Clash Royale — Supercell](https://supercell.com/en/games/clashroyale/). A paleta é uma adaptação para esta interface, não uma especificação oficial de marca.

Os testes verificam cinco larguras, pontuação, filtros, carregamento, campos de aparência e persistência. As capturas com participantes usam dados simulados apenas nos testes.

## Copa com várias fases

Fases cadastradas em largura completa, com rolagem horizontal e seletor. O Admin oferece nomes padronizados, e variações como “Semifinais” são agrupadas como “Semifinal”. Fases numeradas têm ordem numérica.

O avanço é manual: após registrar os resultados, cadastre os confrontos da próxima fase com os vencedores. Não há geração automática nem propagação dos vencedores. O banco atual não armazena vínculos entre confrontos.

Teste adicional: `node tests/cup.cjs`. Valida, com backend simulado, 32 duplas, 31 partidas e cinco fases, filtros, rolagem em quatro larguras, agrupamento, cadastro de fase e rejeição de empate. A integração com Supabase real não foi validada nesta revisão.

Referências: [Toornament — chaveamentos](https://developer.toornament.com/v2/guides/display-bracket) e [NN/g — modo escuro](https://www.nngroup.com/articles/dark-mode/). A revisão atual substitui os painéis claros por azul-escuro e remove os nomes longos das prévias.

## Chaveamento automático AUTO_CROSS

A configuração atual da Copa agora usa cruzamentos fixos **G4 × G1** na metade superior e **G3 × G2** na inferior, com vagas futuras e conexões visuais até a final. Para Copas AUTO_CROSS, esta regra substitui o avanço manual descrito anteriormente. Consulte [CHAVEAMENTO.md](CHAVEAMENTO.md) para a ordem dos duelos, correção de resultados e testes.
