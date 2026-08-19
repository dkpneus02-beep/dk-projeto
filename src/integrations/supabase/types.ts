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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      atendimento_servicos: {
        Row: {
          atendimento_id: string
          created_at: string
          garantia_km: number | null
          id: string
          iniciado_at: string | null
          concluido_at: string | null
          mecanico_id: string | null
          mao_de_obra: number
          nome: string
          peca_id: string | null
          preco_peca: number
          quantidade: number
          retorno_meses: number
          status: string
          valor: number
        }
        Insert: {
          atendimento_id: string
          created_at?: string
          garantia_km?: number | null
          id?: string
          iniciado_at?: string | null
          concluido_at?: string | null
          mecanico_id?: string | null
          mao_de_obra?: number
          nome: string
          peca_id?: string | null
          preco_peca?: number
          quantidade?: number
          retorno_meses?: number
          status?: string
          valor?: number
        }
        Update: {
          atendimento_id?: string
          created_at?: string
          garantia_km?: number | null
          id?: string
          iniciado_at?: string | null
          concluido_at?: string | null
          mecanico_id?: string | null
          mao_de_obra?: number
          nome?: string
          peca_id?: string | null
          preco_peca?: number
          quantidade?: number
          retorno_meses?: number
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_servicos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_servicos_mecanico_id_fkey"
            columns: ["mecanico_id"]
            isOneToOne: false
            referencedRelation: "mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_servicos_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimentos: {
        Row: {
          alertas_tecnicos: string | null
          avarias: Json
          cliente_cpf: string | null
          cliente_nome: string
          cliente_telefone: string | null
          cor: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          deleted_at: string | null
          desconto: number
          entrada_at: string
          fabricante: string | null
          finalizado_at: string | null
          fotos: Json
          garantia_ate: string | null
          garantia_km: number | null
          id: string
          km: number | null
          modelo: string | null
          numero: number
          observacao: string | null
          placa: string
          pronto_at: string | null
          pronto_por: string | null
          necessita_retorno: boolean
          data_retorno_manual: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          alertas_tecnicos?: string | null
          avarias?: Json
          cliente_cpf?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          deleted_at?: string | null
          desconto?: number
          entrada_at?: string
          fabricante?: string | null
          finalizado_at?: string | null
          fotos?: Json
          garantia_ate?: string | null
          garantia_km?: number | null
          id?: string
          km?: number | null
          modelo?: string | null
          numero?: number
          observacao?: string | null
          placa: string
          pronto_at?: string | null
          pronto_por?: string | null
          necessita_retorno?: boolean
          data_retorno_manual?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          alertas_tecnicos?: string | null
          avarias?: Json
          cliente_cpf?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          deleted_at?: string | null
          desconto?: number
          entrada_at?: string
          fabricante?: string | null
          finalizado_at?: string | null
          fotos?: Json
          garantia_ate?: string | null
          garantia_km?: number | null
          id?: string
          km?: number | null
          modelo?: string | null
          numero?: number
          observacao?: string | null
          placa?: string
          pronto_at?: string | null
          pronto_por?: string | null
          necessita_retorno?: boolean
          data_retorno_manual?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      aviso_leituras: {
        Row: {
          aviso_id: string
          id: string
          lido_at: string
          user_id: string
          user_nome: string | null
        }
        Insert: {
          aviso_id: string
          id?: string
          lido_at?: string
          user_id: string
          user_nome?: string | null
        }
        Update: {
          aviso_id?: string
          id?: string
          lido_at?: string
          user_id?: string
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aviso_leituras_aviso_id_fkey"
            columns: ["aviso_id"]
            isOneToOne: false
            referencedRelation: "avisos"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos: {
        Row: {
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          id: string
          mecanico_id: string | null
          mensagem: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string
          mecanico_id?: string | null
          mensagem: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          id?: string
          mecanico_id?: string | null
          mensagem?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_mecanico_id_fkey"
            columns: ["mecanico_id"]
            isOneToOne: false
            referencedRelation: "mecanicos"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_movimentos: {
        Row: {
          atendimento_id: string | null
          created_at: string
          descricao: string
          forma: string | null
          id: string
          responsavel: string | null
          sessao_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          atendimento_id?: string | null
          created_at?: string
          descricao: string
          forma?: string | null
          id?: string
          responsavel?: string | null
          sessao_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          atendimento_id?: string | null
          created_at?: string
          descricao?: string
          forma?: string | null
          id?: string
          responsavel?: string | null
          sessao_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "caixa_movimentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_movimentos_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "caixa_sessoes"
            referencedColumns: ["id"]
          },
        ]
      }
      caixa_sessoes: {
        Row: {
          aberto: boolean
          created_at: string
          data: string
          fechado_at: string | null
          id: string
          responsavel: string
          valor_inicial: number
        }
        Insert: {
          aberto?: boolean
          created_at?: string
          data?: string
          fechado_at?: string | null
          id?: string
          responsavel: string
          valor_inicial?: number
        }
        Update: {
          aberto?: boolean
          created_at?: string
          data?: string
          fechado_at?: string | null
          id?: string
          responsavel?: string
          valor_inicial?: number
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          aviso_antecedencia_min: number
          garantia_dias: number
          horario_fechamento: string
          id: boolean
          nome_oficina: string
          endereco: string
          telefone: string
          cnpj: string
        }
        Insert: {
          aviso_antecedencia_min?: number
          garantia_dias?: number
          horario_fechamento?: string
          id?: boolean
          nome_oficina?: string
          endereco?: string
          telefone?: string
          cnpj?: string
        }
        Update: {
          aviso_antecedencia_min?: number
          garantia_dias?: number
          horario_fechamento?: string
          id?: boolean
          nome_oficina?: string
          endereco?: string
          telefone?: string
          cnpj?: string
        }
        Relationships: []
      }
      mecanicos: {
        Row: {
          ativo: boolean
          created_at: string
          deleted_at: string | null
          id: string
          nome: string
          telefone: string | null
          email: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome: string
          telefone?: string | null
          email?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notificacoes_retorno: {
        Row: {
          atendimento_id: string | null
          cliente_nome: string
          created_at: string
          id: string
          servico: string
          status: string
          telefone: string | null
          veiculo: string | null
          vencimento: string
        }
        Insert: {
          atendimento_id?: string | null
          cliente_nome: string
          created_at?: string
          id?: string
          servico: string
          status?: string
          telefone?: string | null
          veiculo?: string | null
          vencimento: string
        }
        Update: {
          atendimento_id?: string | null
          cliente_nome?: string
          created_at?: string
          id?: string
          servico?: string
          status?: string
          telefone?: string | null
          veiculo?: string | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_retorno_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos: {
        Row: {
          atendimento_id: string | null
          created_at: string
          forma: string
          id: string
          parcelas: number
          valor: number
        }
        Insert: {
          atendimento_id?: string | null
          created_at?: string
          forma: string
          id?: string
          parcelas?: number
          valor: number
        }
        Update: {
          atendimento_id?: string | null
          created_at?: string
          forma?: string
          id?: string
          parcelas?: number
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pecas: {
        Row: {
          categoria: string
          construcao: string | null
          created_at: string
          deleted_at: string | null
          estoque: number
          estoque_minimo: number
          id: string
          indice_carga: string | null
          marca: string | null
          margem: number
          medida: string | null
          modelo_desenho: string | null
          nome: string
          preco_custo: number
          preco_venda: number
          simbolo_velocidade: string | null
          sku: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          categoria?: string
          construcao?: string | null
          created_at?: string
          deleted_at?: string | null
          estoque?: number
          estoque_minimo?: number
          id?: string
          indice_carga?: string | null
          marca?: string | null
          margem?: number
          medida?: string | null
          modelo_desenho?: string | null
          nome: string
          preco_custo?: number
          preco_venda?: number
          simbolo_velocidade?: string | null
          sku?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          construcao?: string | null
          created_at?: string
          deleted_at?: string | null
          estoque?: number
          estoque_minimo?: number
          id?: string
          indice_carga?: string | null
          marca?: string | null
          margem?: number
          medida?: string | null
          modelo_desenho?: string | null
          nome?: string
          preco_custo?: number
          preco_venda?: number
          simbolo_velocidade?: string | null
          sku?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string
          telefone: string | null
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string
          telefone?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          telefone?: string | null
        }
        Relationships: []
      }
      servicos_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          deleted_at: string | null
          garantia_km: number | null
          id: string
          nome: string
          preco_padrao: number
          retorno_meses: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          garantia_km?: number | null
          id?: string
          nome: string
          preco_padrao?: number
          retorno_meses?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          garantia_km?: number | null
          id?: string
          nome?: string
          preco_padrao?: number
          retorno_meses?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      adicionar_entrada_estoque: {
        Args: {
          _peca_id: string
          _quantidade: number
        }
        Returns: Database["public"]["Tables"]["pecas"]["Row"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "gerente" | "mecanico"
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
      app_role: ["gerente", "mecanico"],
    },
  },
} as const
