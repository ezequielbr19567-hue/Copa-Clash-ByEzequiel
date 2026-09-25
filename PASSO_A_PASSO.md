# Passo a passo — Clash da Turma (SEM Node.js)

Este projeto é estático. Você NÃO precisa instalar Node.js, npm, Vite ou abrir terminal.
Tudo pode ser feito pelo navegador.

## 1. Criar o Supabase

1. Entre em https://supabase.com e crie um projeto.
2. Abra **SQL Editor** > **New query**.
3. No ZIP, abra `supabase/schema.sql`, copie TODO o conteúdo, cole no SQL Editor e clique em **Run**.
4. O banco estará pronto com segurança RLS.

## 2. Criar o administrador

1. No Supabase, abra **Authentication** > **Users**.
2. Crie um usuário com seu e-mail e uma senha forte.
3. Volte ao **SQL Editor** e execute, trocando o e-mail:

```sql
insert into public.profiles (id, display_name, role)
select id, 'Administrador', 'admin'
from auth.users
where email = 'SEU_EMAIL_AQUI'
on conflict (id) do update set role = 'admin';
```

A senha NÃO vai para o GitHub. Ela fica no Supabase Auth.

## 3. Pegar a URL e chave pública do Supabase

No painel do Supabase, procure as configurações de API do projeto e copie:

- Project URL
- chave pública `anon` / `publishable`

Nunca use a chave `service_role` no site.

## 4. Colocar o projeto no GitHub — sem terminal

1. Entre em https://github.com.
2. Clique em **New repository**.
3. Dê um nome, por exemplo `clash-da-turma`.
4. Crie o repositório.
5. Clique em **Add file** > **Upload files**.
6. Extraia o ZIP no seu computador.
7. Arraste TODO o conteúdo da pasta `clash-da-turma-static` para o GitHub, mantendo as pastas `css`, `js` e `supabase`.
8. Clique em **Commit changes**.

IMPORTANTE: no GitHub, o `index.html` deve aparecer na raiz do repositório, não dentro de outra pasta extra.

## 5. Configurar o Supabase direto pelo GitHub

1. No repositório, abra `js/config.js`.
2. Clique no ícone de editar (lápis).
3. Troque:

```js
SUPABASE_URL: 'COLE_AQUI_SUA_SUPABASE_URL',
SUPABASE_ANON_KEY: 'COLE_AQUI_SUA_CHAVE_PUBLICA_ANON'
```

pelos dados do seu projeto.

4. Clique em **Commit changes**.

A URL e a chave pública do Supabase podem aparecer no código do navegador. A segurança das alterações está nas políticas RLS do banco. A `service_role` jamais deve ser colocada aqui.

## 6. Publicar na Vercel — sem terminal

1. Entre em https://vercel.com.
2. Faça login e conecte sua conta do GitHub.
3. Clique em **Add New** > **Project**.
4. Importe o repositório `clash-da-turma`.
5. Em Framework Preset, use **Other** caso a Vercel pergunte.
6. Não coloque comando de Build.
7. Não coloque comando de Install.
8. A raiz do projeto é a própria raiz do repositório.
9. Clique em **Deploy**.

A Vercel servirá os arquivos HTML/CSS/JS diretamente. Não existe etapa de Node.js.

Depois, seu site terá uma URL parecida com:

`https://clash-da-turma.vercel.app`

A área administrativa será:

`https://clash-da-turma.vercel.app/admin`

ou, caso necessário:

`https://clash-da-turma.vercel.app/admin.html`

## 7. Primeiro cadastro

Entre no `/admin` e faça nesta ordem:

1. **Jogadores** — cadastre todos.
2. Para quem disputa o campeonato 1v1, deixe marcada a opção de criar participante SOLO.
3. **Duplas** — forme cada equipe da Copa com exatamente 2 jogadores.
4. **Competições**:
   - Campeonato: `Pontos corridos`, normalmente `1v1`.
   - Copa: `Copa / eliminação`; o sistema fixa `2v2`.
5. **Partidas** — cadastre rodada/fase e participantes.
6. **Resultados** — informe as coroas.
7. **Registro jogo a jogo** — opcional, para detalhar cada batalha do confronto.

## 8. Regras implementadas

### Campeonato

- Vitória: **+3 pontos**
- Empate: **+1 ponto para cada**
- Derrota normal: **0 ponto**
- Derrota por **0 × 3 coroas: -1 ponto** para o perdedor

Desempate exibido no site:

1. Pontos
2. Vitórias
3. Saldo de coroas
4. Coroas feitas
5. Nome

### Copa

- Somente **2v2**
- Eliminação direta
- Resultado final empatado é bloqueado
- Cada dupla precisa ter exatamente **2 jogadores** antes de entrar em uma partida
- Use fases como `Oitavas`, `Quartas`, `Semifinal` e `Final`

## 9. Testar sem instalar nada

A forma mais fácil é publicar na Vercel e testar na URL fornecida.

Se quiser apenas visualizar os arquivos antes, `index.html` pode até ser aberto diretamente no navegador, mas os módulos JavaScript externos podem ser bloqueados em alguns navegadores quando usados como arquivo local. Na Vercel funciona como site normal.

## 10. Atualizações futuras

Quando quiser mudar o site:

1. Abra o arquivo no GitHub.
2. Clique no lápis.
3. Edite.
4. Clique em **Commit changes**.

A Vercel detecta o commit no GitHub e publica a alteração automaticamente.

## Personalizar o visual

Em projetos que já têm banco configurado, execute `supabase/site-settings.sql` no SQL Editor uma vez. Entre em **Admin → Aparência** para configurar o nome, imagem (URL HTTPS), cor, títulos, texto de carregamento e destaque inicial. Descrição e rodapé são opcionais e ficam ocultos quando vazios. Para novos projetos, a tabela já está incluída em `schema.sql`.
