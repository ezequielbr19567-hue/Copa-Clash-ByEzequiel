# Passo a passo — atualizar sem apagar o Supabase

## Se o seu Supabase já existe

1. **Não delete o projeto Supabase.**
2. No SQL Editor, execute `supabase/copa-v3-migration.sql`.
3. Se quiser carregar exatamente os 20 participantes e grupos solicitados, execute em seguida `supabase/copa-2026-dados.sql`.
4. Publique os arquivos atualizados do site.
5. Abra `admin.html` e faça login com o mesmo usuário de antes.

A URL e a chave pública continuam em `js/config.js`. A partir desta versão, quando a configuração é válida, o navegador também salva uma cópia local. Isso evita que uma atualização do site faça o Admin voltar para “Conecte o Supabase” por causa de arquivo substituído/cache.

Se a tela de conexão aparecer mesmo assim, cole a **Project URL** e a **publishable/anon key** diretamente nela. Não é necessário recriar o banco.

## Se o banco é novo

1. Execute `supabase/schema.sql`.
2. Execute `supabase/copa-2026-dados.sql` se quiser os grupos já preenchidos.
3. Em Authentication → Users, crie seu usuário.
4. No final de `schema.sql` existe o SQL para transformar esse usuário em Admin.

## Grupos desta edição

- Grupo 1 — Marko, Gabriel, Fagner, Alemão, Jorge
- Grupo 2 — Thiago, Lucas Borba, Emanuel, Josué, Joao Gabriel
- Grupo 3 — João Beretta, Willian, Felipe, Antony, Miranha
- Grupo 4 — Ezequiel, Erick, Gustavo Barboza, Victor, Lucas Brum

## Criar as partidas dos grupos

Depois que os grupos estiverem carregados:

1. abra Admin → **Grupos**;
2. confira a distribuição;
3. toque em **Gerar jogos dos grupos**.

O site cria 10 partidas para cada grupo de 5 jogadores, totalizando 40 partidas, sem duplicar confrontos já existentes.

## Lançar resultados

Em Admin → **Resultados**:

- informe as coroas dos dois jogadores;
- se houver vencedor, informe o tempo em `mm:ss`;
- opcionalmente cole o link do vídeo;
- salve.

Pontuação: vitória +3, empate 0, derrota comum 0, derrota por 0×3 = -1.

Desempate: pontos → SG (saldo de coroas) → menor tempo total das vitórias.

## Mata-mata

Enquanto a fase de grupos está acontecendo, o site público já mostra uma **projeção ao vivo** das oitavas usando a classificação atual. Quando todos os jogos terminarem, essa projeção vira a chave oficial sincronizada pelo Admin.

O Grupo 4 cruza com o Grupo 1 de forma invertida: 1º×4º, 2º×3º, 3º×2º, 4º×1º. O Grupo 3 cruza da mesma forma com o Grupo 2.

Depois, cada resultado do mata-mata alimenta automaticamente quartas, semifinal e final. Antes do primeiro jogo eliminatório, correções nos grupos podem reajustar a chave; depois que o mata-mata começa, a chave iniciada fica preservada. Há também um botão **Sincronizar chave oficial** em Admin → Grupos.

## Vídeos

Em Admin → **Partidas**, toque em uma partida cadastrada para abrir a edição de data e vídeo. O card fica recolhido por padrão para não deixar o painel ruim no celular.

Cole o link compartilhável do Google Drive, YouTube, Shorts, Vimeo ou um vídeo HTTPS direto. Links do Drive são convertidos para o player interno `/preview`. O arquivo do Drive precisa permitir visualização para quem vai acessar a Copa. Os players só carregam quando o visitante toca em **Assistir**.
