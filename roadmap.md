
## 2026-08-31
- [x] Corrigir erros de typecheck do build (recepcao, prazos, weekly-agenda, prazo-reminders)

## 2026-09-11
- [x] Consolidar Prazos no banco e importação sem perda de dados; validar unicidade, reimportação e build
- [x] Criar identidade determinística por nome + processo + data limite
- [x] Consolidar registros duplicados existentes preservando as observações úteis
- [x] Impedir novos duplicados em inserções e atualizações
## 2026-11-11 DJEN
- [x] Inspeção segura (backup, extensões, RLS de prazos, teste CNJ)
- [x] Código de mapeamento/hash, rota de sincronização (dry-run) e migração pendente — NÃO aplicados
- [x] Banco DJEN existente confirmado em 2026-11-13: tabelas/RPCs presentes, 581 prazos; NÃO reaplicar migração
- [x] Código: recebimento protegido, rascunho automático em Prazos, confirmação humana, testes
- [x] Migração já aplicada externamente; arquivo pendente NÃO deve ser executado

## 2026-11-13 Finalização DJEN autorizada
- [x] Inspecionar PR #58 (aberto, head f4f971c); função compila via Deno e RPC coincide; main sincronizado d4a1349
- [ ] Integrar somente djen-sync no main — bloqueado: arquivo ausente no projeto; ferramentas recusam criar Edge Function em TanStack. Proprietário deve integrar seletivamente arquivo, sem remoções Vercel nem migração
- [ ] Corrigir dryRun da função integrada — código do PR grava log de falha mesmo em dryRun e aceita formato CNJ incompleto como vazio
- [ ] Desplegar somente djen-sync — tentativa retornou “Deployed: none. Not found in the codebase: djen-sync”
- [ ] Verificar DJEN_CRON_SECRET no runtime e POST dryRun autenticado — secreto existe no projeto, função retorna 404
- [ ] Se CNJ/dryRun passarem, configurar uma única tarefa diária nativa às 09:00 UTC com autenticação segura — bloqueado pelo dryRun
- [ ] Se dryRun passar, executar primeira ingestão e conferir originais, deduplicação, borradores e 581 prazos prévios intactos — bloqueado pelo dryRun
- [ ] Completar somente lacunas DJEN na UI: impressão, vínculo visível a Prazos, permissões e limites 1–6 de antecedência — bloqueado pela integração seletiva da função
- [x] Executar 9 testes existentes DJEN (todos passaram); preview build OK
- [ ] Resolver 3 erros de lint DJEN existentes e conferir fluxo autenticado antes de publicar — bloqueado por integração; não publicado
