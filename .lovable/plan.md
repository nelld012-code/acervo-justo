# Consolidar Prazos sem perda de informação

## Resultado esperado

- Cada prazo terá identidade única por **nome normalizado + número do processo normalizado + data limite**, incluindo um marcador estável quando a data estiver vazia.
- Os registros duplicados atuais serão reduzidos a uma única linha por grupo, preservando a linha mais completa e reunindo observações úteis sem repetições.
- Criar, editar ou reimportar um prazo não voltará a gerar duplicatas.
- A lista, os filtros, os alertas, a paginação e os contadores continuarão usando os registros reais já consolidados.

## Implementação

1. **Migração e consolidação segura**
   - Adicionar normalização determinística e a coluna `dedupe_key` em `prazos`.
   - Criar funções SQL para comparar e combinar observações, priorizando a mais informativa e acrescentando somente fragmentos distintos.
   - Antes do índice único, escolher a linha principal mais completa de cada grupo, mesclar observações e campos úteis, atualizar `updated_at` e remover somente as linhas redundantes já absorvidas.
   - Criar índice único em `dedupe_key` e manter a chave sincronizada em inserções e edições.
   - Disponibilizar uma operação autenticada de importação que faça a mesclagem no banco de forma atômica, respeitando as regras atuais de acesso.

2. **Importação e edição em Prazos**
   - Reutilizar no navegador a mesma normalização para eliminar repetições internas do Excel antes da gravação.
   - Preservar a prévia e os diffs atuais, mas identificar existentes pela nova identidade completa, não apenas pelo processo.
   - Enviar importações pela operação segura do banco, para que conflitos consolidem observações em vez de sobrescrever conteúdo melhor.
   - Manter a edição manual protegida pelo mesmo índice; quando a edição formar uma identidade já existente, mostrar o erro sem apagar dados.

3. **Tipos e verificação**
   - Atualizar os tipos relacionados a `prazos` e à operação de importação após a migração.
   - Conferir no banco: total antes/depois, ausência de grupos duplicados, observações consolidadas e funcionamento do índice único.
   - Simular uma reimportação idempotente e confirmar que a contagem não aumenta.
   - Validar compilação e Preview sem alterar outras páginas ou regras de Prazos.

## Premissas de preservação

- Campos vazios nunca substituirão campos preenchidos.
- Para divergências úteis em parte, advogado, status, conclusão e lembretes, a linha principal mantém seus dados e campos vazios podem ser preenchidos pelos duplicados.
- Apenas observações recebem combinação textual; frases equivalentes ou contidas em uma versão mais completa não serão repetidas.
