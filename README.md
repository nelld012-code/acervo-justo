# Arquivo Jurídico Central

I need you to build a full-stack Judicial Document Management System (Sistema de Gestão de Documentos Judiciais) using React with TypeScript, Tailwind CSS, shadcn/ui components, and Supabase for the backend and database.

**CRITICAL UI LANGUAGE REQUIREMENT:** All user interface texts, labels, menus, placeholders, error messages, and notifications must be displayed in **Brazilian Portuguese**. Do not use English in the frontend UI. Only the code and comments can be in English.

---

**PROJECT STRUCTURE & PAGES:**

1. **Authentication:** Use Supabase Auth with email/password login. Create a protected route wrapper.

2. **Sidebar Navigation:** Include links for "Dashboard", "Upload Document", "Document Search", "My Documents", and "Audit Log".

3. **Dashboard:** Display summary cards showing total documents, counts by status (Aberto/Open, Em revisão/In review, Arquivado/Archived, Encerrado/Closed), and a recent activity list.

4. **Upload Page:** A drag-and-drop upload zone supporting PDF, DOCX, PNG, and JPG. After uploading the physical file, a detailed metadata form must appear.

---

**DATABASE SCHEMA (SUPABASE):**

Create a table called `documents` with the following columns (all names in English/standard for the DB, but data is in PT-BR). Set appropriate data types and indexes on `advogado`, `numero_processo`, and `data_documento`.

- `id` (uuid, primary key)

- `internal_id` (text, unique, auto-generated format: "DOC-YYYY-000XXX")

- `advogado` (text, required) - Lawyer's name

- `numero_processo` (text, required) - Process number, with a standard index

- `data_documento` (date, required) - Document date

- `data_ingresso` (date, required - defaults to now()) - Entry date

- `data_processo` (date, optional) - Process date

- `tipo_documento` (text, required - e.g., Petição Inicial, Contestação, Procuração, Contrato, Sentença, Ofício, Comprovante)

- `cliente` (text, required) - Client name

- `parte_autora` (text, optional) - Plaintiff

- `parte_re` (text, optional) - Defendant

- `orgao_judicial` (text, optional but recommended) - Court/Judicial body

- `materia` (text, required - e.g., Civil, Penal, Trabalhista, Família, Administrativo)

- `estado_processual` (text, required - options: "Aberto", "Em revisão", "Arquivado", "Encerrado")

- `confidencialidade` (text, required - options: "Público", "Restrito", "Confidencial")

- `palavras_chave` (text[], optional) - Tags/Keywords array

- `file_url` (text, required) - Path to file in Supabase Storage

- `file_name` (text, required) - Original file name

- `file_size` (integer) - File size in KB

- `current_version` (integer, default: 1)

- `created_by` (uuid, references auth.users)

- `created_at` (timestamp)

- `updated_at` (timestamp)

**AUDIT & VERSIONING TABLES:**

1. Create `document_versions` table: `id`, `document_id` (references), `version_number`, `file_url`, `uploaded_by`, `uploaded_at`, `change_notes`.

2. Create `audit_logs` table: `id`, `user_id`, `document_id`, `action` (viewed, uploaded, edited, deleted, downloaded), `timestamp`, `ip_address` (optional).

**STORAGE:** Create a Supabase Storage bucket named `legal_docs`. Implement automatic folder structure: `{ano}/{cliente}/{numero_processo}/` when saving files. Implement an automatic naming convention: `PROC_{numero_processo}_{tipo_documento}_{YYYYMMDD}.pdf`.

---

**BUSINESS RULES & FEATURES:**

1. **Validation:** All fields marked as "required" must be strictly validated before submission.

2. **Search & Filters (Crucial):**

   - A global search bar that supports both **exact match** and **flexible/partial search** (using ILIKE for text fields).

   - Dedicated filters for: Lawyer (advogado), Process Number (exact and partial), Date Range (data_documento), Document Type, and Case Status.

   - Allow **combined filters** (e.g., Lawyer + Date Range + Status). The results must update dynamically.

3. **Document Versioning:** If a user uploads a new file for an existing `numero_processo` and `tipo_documento`, automatically create a new record in `document_versions` and increment the `current_version` in the main table. Keep the old file accessible.

4. **Audit Trail:** Every view, upload, edit, or delete must be logged to the `audit_logs` table automatically (using Supabase Database Triggers or Row Level Security with middleware).

5. **Permissions (RLS):** Implement Row Level Security in Supabase.

   - All authenticated users can view documents.

   - Only users with the role "Admin" or "Manager" can delete or change confidentiality.

   - Users can only edit documents they created, unless they are Admin.

   - (Create a custom `user_roles` table or use raw_app_meta_data to manage roles).

---

**UI/UX SPECIFICS:**

- Use **shadcn/ui** components (Table, Dialog, Form, Tabs, Alert, Badge) for a clean, professional look.

- The main search results should be displayed in a sortable, paginated data table.

- Clicking a row opens a **Detail View** modal/sheet showing all metadata, a preview/download button for the file, and a tabbed section for "Version History" and "Audit Log".

- Implement toast notifications for success/error feedback (using sonner).

---

**STARTING POINT:**

Begin by generating the complete Supabase SQL migration schema (including RLS policies and triggers for `updated_at` and audit logs). Then, scaffold the React application with the defined routes, authentication flow, and the upload form. Ensure the file upload process first saves the file to storage, retrieves the public URL, and then saves the metadata to the database in a single transaction.

Make the dashboard visually impressive with charts (using Recharts if needed) showing document influx by month.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://acervo-justo.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3a20ae50-781d-485b-bf94-455f13c6e988).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
