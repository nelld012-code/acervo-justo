
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
- [ ] Integrar e verificar somente a função existente djen-sync do PR #58, preservando recursos Vercel
- [ ] Desplegar somente djen-sync e verificar secreto no runtime com POST dryRun autenticado
- [ ] Se CNJ/dryRun passarem, configurar uma única tarefa diária nativa às 09:00 UTC com autenticação segura
- [ ] Se dryRun passar, executar primeira ingestão e conferir originais, deduplicação, borradores e 581 prazos prévios intactos
- [ ] Completar somente lacunas DJEN na UI: revisão, confirmação, vínculo a Prazos e impressão
- [ ] Executar testes/lint, conferir preview e publicar somente após validação
