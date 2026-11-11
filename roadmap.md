
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
- [ ] Aplicar migração e cron — bloqueado: backup não verificável por mim, pg_net ausente, CNJ bloqueia acesso fora do Brasil
- [ ] Ligar a página /intimacoes aos dados reais e ação "Criar prazo" — depende da migração
