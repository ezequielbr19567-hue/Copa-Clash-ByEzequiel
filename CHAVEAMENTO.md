# Chaveamento automático

A Copa com `format_config.knockout_mode = AUTO_CROSS` mostra todas as fases mesmo sem partidas eliminatórias salvas. Para os quatro grupos e quatro classificados por grupo atuais, a ordem é:

| Duelo | Participante A | Participante B |
| --- | --- | --- |
| 1 | 1º G4 | 4º G1 |
| 2 | 2º G4 | 3º G1 |
| 3 | 3º G4 | 2º G1 |
| 4 | 4º G4 | 1º G1 |
| 5 | 1º G3 | 4º G2 |
| 6 | 2º G3 | 3º G2 |
| 7 | 3º G3 | 2º G2 |
| 8 | 4º G3 | 1º G2 |

Quartas: D9 recebe vencedores D1/D2; D10 recebe D3/D4; D11 recebe D5/D6; D12 recebe D7/D8. Semifinais: D13 recebe D9/D10; D14 recebe D11/D12. Final D15 recebe D13/D14. Não há novo sorteio entre fases.

Antes de todos os jogos de grupos cadastrados terminarem com placar válido, os nomes são projeções e não podem receber resultado eliminatório. Vagas sem participante mostram sua origem. A classificação considera pontos, vitórias, saldo, coroas a favor e nome; ID resolve nomes idênticos. Todos os grupos precisam existir e ter participantes suficientes. É necessário cadastrar todos os jogos previstos dos grupos antes de encerrá-los.

No Admin, a aba Resultados inclui confrontos automáticos assim que ambos os participantes estiverem definidos. Ao salvar, o confronto é persistido como `stage_type=KNOCKOUT`, com `bracket_key` estável e `bracket_order`; os vencedores alimentam a fase seguinte. A página pública consulta atualizações a cada 30 segundos enquanto visível. Nenhum dado é gravado pelo visitante.

Uma correção que troque participantes invalida, na apresentação, os placares incompatíveis dos confrontos seguintes. Esses confrontos precisam receber um novo resultado no Admin. O histórico não é apagado automaticamente. Partidas antigas sem chave são reconhecidas pela fase e pelos participantes; a ordem invertida dos participantes também é tratada.

A integração utiliza campos já existentes no projeto Supabase atual. Bancos criados apenas com o schema.sql antigo precisam desses campos e da configuração AUTO_CROSS. Copas antigas sem AUTO_CROSS mantêm o agrupamento manual.

Validação: `node tests/auto-cross.cjs` testa a regra da imagem, o avanço até campeão, correções, empates, conexões visuais, filtros e cadastro no Admin com banco simulado. `node tests/connection.cjs` valida somente leituras do projeto configurado, sem salvar resultados reais.
