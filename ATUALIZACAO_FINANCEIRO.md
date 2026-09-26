

## Correção pós-deploy — falha ao finalizar e entregar OS

A investigação dos logs reais do Supabase identificou duas falhas objetivas na tentativa de finalizar a OS:

1. `Lotes insuficientes para a baixa de estoque.` A peça da OS #6 tinha estoque atual de 4 unidades, mas saldo de lotes igual a 0. Isso ocorreu porque entradas legadas atualizaram `pecas.estoque` antes da implantação de `peca_lotes` e não criaram lote correspondente.
2. `A soma dos pagamentos deve ser igual ao total da OS.` O valor enviado pela tela podia permanecer momentaneamente com o total anterior quando o desconto Pix era recalculado.

Foi aplicada no Supabase a migração `20260926100000_reconciliar_lotes_estoque_legado.sql`. Ela registra as diferenças antigas como lotes com origem `ajuste_estoque_legado`, mantém o histórico e torna o consumo compatível com saldo legado. A validação posterior encontrou **0 divergências** entre `pecas.estoque` e a soma dos lotes.

No frontend, o pagamento único é normalizado para o total efetivo, arredondado a centavos, antes do envio da RPC. Pagamentos múltiplos continuam exigindo que a soma informada corresponda ao total da OS.

Build e lint foram executados com sucesso; não há erros de lint. A produção permanece na versão revertida; a correção de código ainda aguarda autorização explícita para novo deploy.
