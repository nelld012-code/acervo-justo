export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          details: Json | null
          document_id: string | null
          id: string
          ip_address: string | null
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          document_id?: string | null
          id?: string
          ip_address?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          document_id?: string | null
          id?: string
          ip_address?: string | null
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          bairro: string | null
          cidade: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          data_atendimento: string | null
          email: string | null
          endereco: string | null
          estado_civil: string | null
          id: string
          nome: string
          numero_processo: string | null
          observacoes: string | null
          profissao: string | null
          resumo_atendimento: string | null
          reu_bairro: string | null
          reu_cidade: string | null
          reu_endereco: string | null
          reu_estado_civil: string | null
          reu_nome: string | null
          reu_profissao: string | null
          reu_rg_cnpj: string | null
          rg: string | null
          telefone: string
          tipo_acao: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cidade?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          data_atendimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          id?: string
          nome: string
          numero_processo?: string | null
          observacoes?: string | null
          profissao?: string | null
          resumo_atendimento?: string | null
          reu_bairro?: string | null
          reu_cidade?: string | null
          reu_endereco?: string | null
          reu_estado_civil?: string | null
          reu_nome?: string | null
          reu_profissao?: string | null
          reu_rg_cnpj?: string | null
          rg?: string | null
          telefone: string
          tipo_acao?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cidade?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          data_atendimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: string | null
          id?: string
          nome?: string
          numero_processo?: string | null
          observacoes?: string | null
          profissao?: string | null
          resumo_atendimento?: string | null
          reu_bairro?: string | null
          reu_cidade?: string | null
          reu_endereco?: string | null
          reu_estado_civil?: string | null
          reu_nome?: string | null
          reu_profissao?: string | null
          reu_rg_cnpj?: string | null
          rg?: string | null
          telefone?: string
          tipo_acao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_versions: {
        Row: {
          change_notes: string | null
          document_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          document_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          document_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          advogado: string
          cliente: string
          cliente_id: string | null
          confidencialidade: string
          created_at: string
          created_by: string | null
          current_version: number
          data_documento: string
          data_ingresso: string
          data_processo: string | null
          estado_processual: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          internal_id: string
          materia: string
          numero_processo: string
          orgao_judicial: string | null
          palavras_chave: string[] | null
          parte_autora: string | null
          parte_re: string | null
          tipo_documento: string
          updated_at: string
          valor_recebido_total: number
          valor_total_processo: number | null
        }
        Insert: {
          advogado: string
          cliente: string
          cliente_id?: string | null
          confidencialidade?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          data_documento: string
          data_ingresso?: string
          data_processo?: string | null
          estado_processual?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          internal_id: string
          materia: string
          numero_processo: string
          orgao_judicial?: string | null
          palavras_chave?: string[] | null
          parte_autora?: string | null
          parte_re?: string | null
          tipo_documento: string
          updated_at?: string
          valor_recebido_total?: number
          valor_total_processo?: number | null
        }
        Update: {
          advogado?: string
          cliente?: string
          cliente_id?: string | null
          confidencialidade?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          data_documento?: string
          data_ingresso?: string
          data_processo?: string | null
          estado_processual?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          internal_id?: string
          materia?: string
          numero_processo?: string
          orgao_judicial?: string | null
          palavras_chave?: string[] | null
          parte_autora?: string | null
          parte_re?: string | null
          tipo_documento?: string
          updated_at?: string
          valor_recebido_total?: number
          valor_total_processo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          categoria: string
          comprovante_url: string | null
          created_at: string
          data_despesa: string
          descricao: string
          id: string
          responsavel_pagamento: string | null
          updated_at: string
          user_id: string | null
          valor: number
        }
        Insert: {
          categoria: string
          comprovante_url?: string | null
          created_at?: string
          data_despesa: string
          descricao: string
          id?: string
          responsavel_pagamento?: string | null
          updated_at?: string
          user_id?: string | null
          valor: number
        }
        Update: {
          categoria?: string
          comprovante_url?: string | null
          created_at?: string
          data_despesa?: string
          descricao?: string
          id?: string
          responsavel_pagamento?: string | null
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          created_at: string
          created_by: string | null
          data_pagamento: string
          descricao: string | null
          document_id: string
          id: string
          metodo_pagamento: string
          responsavel_recebimento: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_pagamento: string
          descricao?: string | null
          document_id: string
          id?: string
          metodo_pagamento: string
          responsavel_recebimento: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_pagamento?: string
          descricao?: string | null
          document_id?: string
          id?: string
          metodo_pagamento?: string
          responsavel_recebimento?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cargo: string
          created_at: string
          email: string | null
          id: string
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string
          created_at?: string
          email?: string | null
          id: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reception_entries: {
        Row: {
          advogado: string
          atendente: string
          cpf: string | null
          created_at: string
          created_by: string | null
          data: string
          id: string
          nome_cliente: string
          telefone: string
          updated_at: string
        }
        Insert: {
          advogado: string
          atendente: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          nome_cliente: string
          telefone: string
          updated_at?: string
        }
        Update: {
          advogado?: string
          atendente?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          nome_cliente?: string
          telefone?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string
          created_at: string
          created_by: string | null
          data_tarefa: string
          descricao: string | null
          document_id: string | null
          hora_tarefa: string | null
          id: string
          lembrar_antecedencia_min: number
          lembrar_popup: boolean
          prioridade: string
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          created_at?: string
          created_by?: string | null
          data_tarefa: string
          descricao?: string | null
          document_id?: string | null
          hora_tarefa?: string | null
          id?: string
          lembrar_antecedencia_min?: number
          lembrar_popup?: boolean
          prioridade?: string
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          created_at?: string
          created_by?: string | null
          data_tarefa?: string
          descricao?: string | null
          document_id?: string | null
          hora_tarefa?: string | null
          id?: string
          lembrar_antecedencia_min?: number
          lembrar_popup?: boolean
          prioridade?: string
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "user"],
    },
  },
} as const
