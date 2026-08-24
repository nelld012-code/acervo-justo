# Mensageria Interna — versão mínima

Comunicação interna entre usuários autenticados, sem vínculo com processos, clientes ou documentos. Sem grupos, anexos ou notificações externas.

## O que verifiquei antes de planejar

- Perfis já existem em `profiles` (id, nome, email, cargo, telefone) e são criados automaticamente no cadastro do usuário.
- Importante: hoje a regra de leitura de `profiles` permite que cada usuário veja **apenas o próprio perfil** (administradores e advogados veem todos). Ou seja, uma secretária/assistente não conseguiria listar colegas para enviar mensagem — isso precisa ser resolvido de forma controlada.
- O agendador automático do banco (pg_cron) **não está ativo** hoje; será ativado na migração (com alternativa caso o projeto não permita).
- O menu lateral e o padrão visual atuais serão preservados; apenas um item novo será acrescentado.

## Banco de dados (uma migração)

Nova tabela `public.messages`:
- `sender_id`, `recipient_id` (usuários), `body` (texto), `read_at` (data de leitura), `created_at`, `expires_at` (padrão: 60 dias após o envio).

Regras de acesso (RLS):
- Ler: somente se o usuário for remetente ou destinatário.
- Enviar: somente como remetente (não é possível enviar em nome de outro).
- Marcar como lida: somente o destinatário, e apenas o campo de leitura.
- Apagar: não permitido nesta versão (a expiração cuida da limpeza).
- Permissões (GRANT) para usuários autenticados e para o papel de serviço.

Lista de contatos (sem afrouxar a privacidade de `profiles`):
- Função segura `list_message_contacts()` que devolve somente `id`, `nome` e `cargo` de todos os usuários, para qualquer usuário autenticado. Email e telefone continuam protegidos como hoje.

Retenção de 60 dias (automática, sem depender de alguém abrir a página):
- Função `purge_expired_messages()` que apaga mensagens com `expires_at` no passado.
- Agendamento diário via pg_cron (extensão ativada na mesma migração).
- Alternativa, caso pg_cron não possa ser ativado: um gatilho leve que remove mensagens expiradas periodicamente ao inserir novas, mantendo a regra de leitura que já ignora mensagens vencidas.

Tempo real: a tabela será adicionada à publicação de tempo real do Supabase (mesma infraestrutura já usada no projeto).

## Frontend

Arquivos novos:
- `src/routes/_authenticated/mensagens.tsx` — página `/mensagens` com duas colunas no desktop (lista de usuários à esquerda, conversa à direita) e navegação em uma coluna no celular, seguindo o visual atual do sistema.
- `src/hooks/use-messages.ts` — consultas de contatos, conversa e contagem de não lidas + assinatura de tempo real.

Arquivo alterado:
- `src/components/app-sidebar.tsx` — item "Mensagens" no grupo Principal, com selo de quantidade de não lidas.

Comportamento:
- Lista de usuários (exceto o próprio) com selo de mensagens não lidas por pessoa.
- Ao abrir uma conversa: histórico em ordem cronológica, campo de envio e marcação automática como lida.
- Novas mensagens aparecem em tempo real, sem recarregar a página.
- Textos em português brasileiro; aviso discreto de que mensagens são apagadas após 60 dias.

## Fora do escopo desta versão

Grupos, anexos, edição/exclusão de mensagens, vínculo com processos/clientes/documentos, notificações por e-mail ou aplicativos externos.
