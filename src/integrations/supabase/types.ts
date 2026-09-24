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
      atendimento_mao_obra_custos: {
        Row: {
          atendimento_id: string
          atendimento_servico_id: string
          base_mao_obra: number
          criado_em: string
          custo_total: number
          id: string
          mecanico_id: string | null
          percentual: number
          tipo: string
        }
        Insert: {
          atendimento_id: string
          atendimento_servico_id: string
          base_mao_obra: number
          criado_em?: string
          custo_total: number
          id?: string
          mecanico_id?: string | null
          percentual: number
          tipo: string
        }
        Update: {
          atendimento_id?: string
          atendimento_servico_id?: string
          base_mao_obra?: number
          criado_em?: string
          custo_total?: number
          id?: string
          mecanico_id?: string | null
          percentual?: number
          tipo?: string
        }
        Relationships: []
      }
      financeiro_parametros: {
        Row: {
          custo_mao_obra_percentual: number
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custo_mao_obra_percentual?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custo_mao_obra_percentual?: number
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      peca_lotes: {
        Row: {
          criado_em: string
          custo_unitario: number
          id: string
          origem: string
          peca_id: string
          quantidade_inicial: number
          quantidade_saldo: number
        }
        Insert: {
          criado_em?: string
          custo_unitario: number
          id?: string
          origem?: string
          peca_id: string
          quantidade_inicial: number
          quantidade_saldo: number
        }
        Update: {
          criado_em?: string
          custo_unitario?: number
          id?: string
          origem?: string
          peca_id?: string
          quantidade_inicial?: number
          quantidade_saldo?: number
        }
        Relationships: []
      }
      atendimento_pecas_cmv: {
        Row: {
          atendimento_id: string
          atendimento_servico_id: string
          criado_em: string
          custo_total: number
          custo_unitario: number
          id: string
          peca_id: string
          quantidade: number
          tipo: string
        }
        Insert: {
          atendimento_id: string
          atendimento_servico_id: string
          criado_em?: string
          custo_total: number
          custo_unitario: number
          id?: string
          peca_id: string
          quantidade: number
          tipo: string
        }
        Update: {
          atendimento_id?: string
          atendimento_servico_id?: string
          criado_em?: string
          custo_total?: number
          custo_unitario?: number
          id?: string
          peca_id?: string
          quantidade?: number
          tipo?: string
        }
        Relationships: []
      }
      atendimento_pecas_movimentos: {
        Row: {
          atendimento_id: string
          atendimento_servico_id: string
          created_at: string
          id: string
          peca_id: string
          quantidade: number
          tipo: string
        }
        Insert: {
          atendimento_id: string
          atendimento_servico_id: string
          created_at?: string
          id?: string
          peca_id: string
          quantidade: number
          tipo?: string
        }
        Update: {
          atendimento_id?: string
          atendimento_servico_id?: string
          created_at?: string
          id?: string
          peca_id?: string
          quantidade?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_pecas_movimentos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_pecas_movimentos_atendimento_servico_id_fkey"
            columns: ["atendimento_servico_id"]
            isOneToOne: true
            referencedRelation: "atendimento_servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_pecas_movimentos_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_servicos: {
        Row: {
          atendimento_id: string
          concluido_at: string | null
          created_at: string
          garantia_km: number | null
          id: string
          iniciado_at: string | null
          mao_de_obra: number
          mecanico_id: string | null
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
          concluido_at?: string | null
          created_at?: string
          garantia_km?: number | null
          id?: string
          iniciado_at?: string | null
          mao_de_obra?: number
          mecanico_id?: string | null
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
          concluido_at?: string | null
          created_at?: string
          garantia_km?: number | null
          id?: string
          iniciado_at?: string | null
          mao_de_obra?: number
          mecanico_id?: string | null
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
          cliente_nome: string | null
          cliente_telefone: string | null
          cor: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          data_retorno_manual: string | null
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
          necessita_retorno: boolean
          numero: number
          observacao: string | null
          placa: string | null
          pronto_at: string | null
          pronto_por: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          alertas_tecnicos?: string | null
          avarias?: Json
          cliente_cpf?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_retorno_manual?: string | null
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
          necessita_retorno?: boolean
          numero?: number
          observacao?: string | null
          placa?: string | null
          pronto_at?: string | null
          pronto_por?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          alertas_tecnicos?: string | null
          avarias?: Json
          cliente_cpf?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          data_retorno_manual?: string | null
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
          necessita_retorno?: boolean
          numero?: number
          observacao?: string | null
          placa?: string | null
          pronto_at?: string | null
          pronto_por?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_eventos: {
        Row: {
          acao: string
          created_at: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: number
          motivo: string | null
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: never
          motivo?: string | null
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: never
          motivo?: string | null
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
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
          atendimento_id: string | null
          atendimento_servico_id: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          editado_at: string | null
          excluido_at: string | null
          id: string
          mecanico_id: string | null
          mensagem: string
          mes_referencia: string
        }
        Insert: {
          atendimento_id?: string | null
          atendimento_servico_id?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          editado_at?: string | null
          excluido_at?: string | null
          id?: string
          mecanico_id?: string | null
          mensagem: string
          mes_referencia?: string
        }
        Update: {
          atendimento_id?: string | null
          atendimento_servico_id?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          editado_at?: string | null
          excluido_at?: string | null
          id?: string
          mecanico_id?: string | null
          mensagem?: string
          mes_referencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_atendimento_servico_id_fkey"
            columns: ["atendimento_servico_id"]
            isOneToOne: false
            referencedRelation: "atendimento_servicos"
            referencedColumns: ["id"]
          },
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
          cnpj: string
          endereco: string
          garantia_dias: number
          horario_fechamento: string
          id: boolean
          nome_oficina: string
          telefone: string
        }
        Insert: {
          aviso_antecedencia_min?: number
          cnpj?: string
          endereco?: string
          garantia_dias?: number
          horario_fechamento?: string
          id?: boolean
          nome_oficina?: string
          telefone?: string
        }
        Update: {
          aviso_antecedencia_min?: number
          cnpj?: string
          endereco?: string
          garantia_dias?: number
          horario_fechamento?: string
          id?: boolean
          nome_oficina?: string
          telefone?: string
        }
        Relationships: []
      }
      despesa_parcelas: {
        Row: {
          caixa_movimento_id: string | null
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          despesa_id: string
          forma_pagamento: string | null
          id: string
          numero: number
          status: string
          updated_at: string
          valor: number
          valor_pago: number | null
        }
        Insert: {
          caixa_movimento_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento: string
          despesa_id: string
          forma_pagamento?: string | null
          id?: string
          numero: number
          status?: string
          updated_at?: string
          valor: number
          valor_pago?: number | null
        }
        Update: {
          caixa_movimento_id?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          despesa_id?: string
          forma_pagamento?: string | null
          id?: string
          numero?: number
          status?: string
          updated_at?: string
          valor?: number
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "despesa_parcelas_caixa_movimento_id_fkey"
            columns: ["caixa_movimento_id"]
            isOneToOne: false
            referencedRelation: "caixa_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesa_parcelas_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "despesas_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_financeiras: {
        Row: {
          categoria_id: string | null
          codigo_barras: string | null
          competencia: string
          comprovante_path: string | null
          created_at: string
          criado_por: string | null
          data_emissao: string | null
          data_vencimento: string
          deleted_at: string | null
          descricao: string
          fornecedor: string | null
          id: string
          observacoes: string | null
          recorrencia_meses: number
          recorrencia_origem_id: string | null
          recorrente: boolean
          status: string
          tipo: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          categoria_id?: string | null
          codigo_barras?: string | null
          competencia: string
          comprovante_path?: string | null
          created_at?: string
          criado_por?: string | null
          data_emissao?: string | null
          data_vencimento: string
          deleted_at?: string | null
          descricao: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          recorrencia_meses?: number
          recorrencia_origem_id?: string | null
          recorrente?: boolean
          status?: string
          tipo: string
          updated_at?: string
          valor_total: number
        }
        Update: {
          categoria_id?: string | null
          codigo_barras?: string | null
          competencia?: string
          comprovante_path?: string | null
          created_at?: string
          criado_por?: string | null
          data_emissao?: string | null
          data_vencimento?: string
          deleted_at?: string | null
          descricao?: string
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          recorrencia_meses?: number
          recorrencia_origem_id?: string | null
          recorrente?: boolean
          status?: string
          tipo?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_financeiras_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "financeiro_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_financeiras_recorrencia_origem_id_fkey"
            columns: ["recorrencia_origem_id"]
            isOneToOne: false
            referencedRelation: "despesas_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_categorias: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      mecanicos: {
        Row: {
          ativo: boolean
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          nome: string | null
          telefone: string | null
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          telefone?: string | null
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          telefone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      notificacoes_internas: {
        Row: {
          arquivado_at: string | null
          atendimento_id: string | null
          atendimento_servico_id: string | null
          created_at: string
          criado_por: string | null
          criado_por_nome: string | null
          dedupe_key: string | null
          destinatario_mecanico_id: string | null
          destinatario_user_id: string
          editado_at: string | null
          excluido_at: string | null
          id: string
          lido_at: string | null
          mensagem: string
          mes_referencia: string
          metadata: Json
          reply_to_id: string | null
          thread_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          arquivado_at?: string | null
          atendimento_id?: string | null
          atendimento_servico_id?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          dedupe_key?: string | null
          destinatario_mecanico_id?: string | null
          destinatario_user_id: string
          editado_at?: string | null
          excluido_at?: string | null
          id?: string
          lido_at?: string | null
          mensagem: string
          mes_referencia?: string
          metadata?: Json
          reply_to_id?: string | null
          thread_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          arquivado_at?: string | null
          atendimento_id?: string | null
          atendimento_servico_id?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          dedupe_key?: string | null
          destinatario_mecanico_id?: string | null
          destinatario_user_id?: string
          editado_at?: string | null
          excluido_at?: string | null
          id?: string
          lido_at?: string | null
          mensagem?: string
          mes_referencia?: string
          metadata?: Json
          reply_to_id?: string | null
          thread_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_internas_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_internas_atendimento_servico_id_fkey"
            columns: ["atendimento_servico_id"]
            isOneToOne: false
            referencedRelation: "atendimento_servicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_internas_destinatario_mecanico_id_fkey"
            columns: ["destinatario_mecanico_id"]
            isOneToOne: false
            referencedRelation: "mecanicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_internas_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "notificacoes_internas"
            referencedColumns: ["id"]
          },
        ]
      }
      notificacoes_retorno: {
        Row: {
          atendimento_id: string | null
          cliente_nome: string
          created_at: string
          excluido_at: string | null
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
          excluido_at?: string | null
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
          excluido_at?: string | null
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
      notificacoes_retorno_contatos: {
        Row: {
          contatado_em: string
          contatado_por: string
          contatado_por_nome: string | null
          created_at: string
          id: string
          observacao: string | null
          resultado: string
          retorno_id: string
        }
        Insert: {
          contatado_em?: string
          contatado_por: string
          contatado_por_nome?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          resultado: string
          retorno_id: string
        }
        Update: {
          contatado_em?: string
          contatado_por?: string
          contatado_por_nome?: string | null
          created_at?: string
          id?: string
          observacao?: string | null
          resultado?: string
          retorno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_retorno_contatos_retorno_id_fkey"
            columns: ["retorno_id"]
            isOneToOne: false
            referencedRelation: "notificacoes_retorno"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamento_itens: {
        Row: {
          created_at: string
          descricao: string
          id: string
          orcamento_id: string
          ordem: number
          peca_id: string | null
          quantidade: number
          servico_id: string | null
          tipo: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          orcamento_id: string
          ordem?: number
          peca_id?: string | null
          quantidade?: number
          servico_id?: string | null
          tipo: string
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          orcamento_id?: string
          ordem?: number
          peca_id?: string | null
          quantidade?: number
          servico_id?: string | null
          tipo?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          ano_fabricacao_modelo: string | null
          chassi: string | null
          cilindrada: string | null
          cliente_bairro_cidade: string | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          cor: string | null
          created_at: string
          criado_por: string
          desconto: number
          expires_at: string
          fabricante: string | null
          id: string
          modelo: string | null
          numero: number
          observacao: string | null
          os_id: string | null
          pagamento_pix: boolean
          placa: string | null
          placa_anterior: string | null
          status: string
          subtotal_mao_de_obra: number
          subtotal_pecas: number
          subtotal_pneus: number
          total: number
          updated_at: string
          veiculo_especie_tipo: string | null
        }
        Insert: {
          ano_fabricacao_modelo?: string | null
          chassi?: string | null
          cilindrada?: string | null
          cliente_bairro_cidade?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cor?: string | null
          created_at?: string
          criado_por: string
          desconto?: number
          expires_at?: string
          fabricante?: string | null
          id?: string
          modelo?: string | null
          numero?: number
          observacao?: string | null
          os_id?: string | null
          pagamento_pix?: boolean
          placa?: string | null
          placa_anterior?: string | null
          status?: string
          subtotal_mao_de_obra?: number
          subtotal_pecas?: number
          subtotal_pneus?: number
          total?: number
          updated_at?: string
          veiculo_especie_tipo?: string | null
        }
        Update: {
          ano_fabricacao_modelo?: string | null
          chassi?: string | null
          cilindrada?: string | null
          cliente_bairro_cidade?: string | null
          cliente_cpf?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_nome?: string | null
          cliente_telefone?: string | null
          cor?: string | null
          created_at?: string
          criado_por?: string
          desconto?: number
          expires_at?: string
          fabricante?: string | null
          id?: string
          modelo?: string | null
          numero?: number
          observacao?: string | null
          os_id?: string | null
          pagamento_pix?: boolean
          placa?: string | null
          placa_anterior?: string | null
          status?: string
          subtotal_mao_de_obra?: number
          subtotal_pecas?: number
          subtotal_pneus?: number
          total?: number
          updated_at?: string
          veiculo_especie_tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_os_id_fkey"
            columns: ["os_id"]
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
      peca_referencias: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          marca: string
          observacao: string | null
          peca_id: string
          principal: boolean
          referencia: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          marca: string
          observacao?: string | null
          peca_id: string
          principal?: boolean
          referencia: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          marca?: string
          observacao?: string | null
          peca_id?: string
          principal?: boolean
          referencia?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "peca_referencias_peca_id_fkey"
            columns: ["peca_id"]
            isOneToOne: false
            referencedRelation: "pecas"
            referencedColumns: ["id"]
          },
        ]
      }
      pecas: {
        Row: {
          aceita_desconto_pix: boolean
          aplicacao: string | null
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
          observacoes: string | null
          preco_custo: number
          preco_venda: number
          simbolo_velocidade: string | null
          sku: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          aceita_desconto_pix?: boolean
          aplicacao?: string | null
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
          observacoes?: string | null
          preco_custo?: number
          preco_venda?: number
          simbolo_velocidade?: string | null
          sku?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          aceita_desconto_pix?: boolean
          aplicacao?: string | null
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
          observacoes?: string | null
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
      webpush_subscriptions: {
        Row: {
          ativo: boolean
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          p256dh: string
          ultimo_envio_at: string | null
          ultimo_erro_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          p256dh: string
          ultimo_envio_at?: string | null
          ultimo_erro_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          ultimo_envio_at?: string | null
          ultimo_erro_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adicionar_entrada_estoque_com_custo: {
        Args: { _peca_id: string; _preco_custo: number; _quantidade: number }
        Returns: {
          aceita_desconto_pix: boolean
          aplicacao: string | null
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
          observacoes: string | null
          preco_custo: number
          preco_venda: number
          simbolo_velocidade: string | null
          sku: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pecas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adicionar_entrada_estoque: {
        Args: { _peca_id: string; _quantidade: number }
        Returns: {
          aceita_desconto_pix: boolean
          aplicacao: string | null
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
          observacoes: string | null
          preco_custo: number
          preco_venda: number
          simbolo_velocidade: string | null
          sku: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pecas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      atualizar_alertas_financeiros: {
        Args: { _antecedencia?: number; _hoje?: string }
        Returns: number
      }
      baixar_pecas_atendimento: {
        Args: { _atendimento_id: string }
        Returns: undefined
      }
      can_view_atendimento: {
        Args: { _atendimento_id: string }
        Returns: boolean
      }
      cancelar_despesa_financeira: {
        Args: { _despesa_id: string }
        Returns: undefined
      }
      criar_notificacao_interna: {
        Args: {
          _atendimento_id?: string
          _atendimento_servico_id?: string
          _dedupe_key?: string
          _destinatario_mecanico_id?: string
          _destinatario_user_id: string
          _mensagem: string
          _metadata?: Json
          _tipo: string
          _titulo: string
        }
        Returns: string
      }
      editar_despesa_financeira: {
        Args: {
          _categoria_id: string
          _competencia: string
          _data_vencimento: string
          _descricao: string
          _despesa_id: string
          _fornecedor: string
          _observacoes: string
          _recorrente: boolean
          _tipo: string
          _valor_total: number
        }
        Returns: undefined
      }
      enviar_notificacao_manual: {
        Args: {
          _atendimento_id?: string
          _atendimento_servico_id?: string
          _destinatario_user_id: string
          _mensagem: string
          _reply_to_id?: string
          _thread_id?: string
          _tipo?: string
          _titulo: string
        }
        Returns: string
      }
      estornar_pecas_atendimento: {
        Args: { _atendimento_id: string }
        Returns: undefined
      }
      excluir_despesa_financeira: {
        Args: { _despesa_id: string }
        Returns: undefined
      }
      finalizar_atendimento_transacional: {
        Args: {
          _atendimento_id: string
          _data_retorno_manual?: string
          _desconto: number
          _necessita_retorno?: boolean
          _pagamentos: Json
        }
        Returns: Json
      }
      gerar_despesas_recorrentes: {
        Args: { _competencia: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iniciar_atendimento_orcamento: {
        Args: { _orcamento_id: string }
        Returns: string
      }
      limpar_orcamentos_expirados: { Args: never; Returns: number }
      mecanico_id_permitido: {
        Args: { _mecanico_id: string }
        Returns: boolean
      }
      normalizar_referencia_peca: { Args: { valor: string }; Returns: string }
      pagar_despesa_parcela: {
        Args: {
          _forma_pagamento: string
          _parcela_id: string
          _valor_pago?: number
        }
        Returns: Json
      }
      proximo_numero_atendimento: { Args: never; Returns: number }
      reabrir_atendimento_transacional: {
        Args: { _atendimento_id: string }
        Returns: Json
      }
      salvar_orcamento: {
        Args: { _dados: Json; _itens: Json; _orcamento_id: string }
        Returns: {
          ano_fabricacao_modelo: string | null
          chassi: string | null
          cilindrada: string | null
          cliente_bairro_cidade: string | null
          cliente_cpf: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_nome: string | null
          cliente_telefone: string | null
          cor: string | null
          created_at: string
          criado_por: string
          desconto: number
          expires_at: string
          fabricante: string | null
          id: string
          modelo: string | null
          numero: number
          observacao: string | null
          os_id: string | null
          pagamento_pix: boolean
          placa: string | null
          placa_anterior: string | null
          status: string
          subtotal_mao_de_obra: number
          subtotal_pecas: number
          subtotal_pneus: number
          total: number
          updated_at: string
          veiculo_especie_tipo: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orcamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      webpush_config_for_service: {
        Args: never
        Returns: {
          private_key: string
          public_key: string
          subject: string
          trigger_secret: string
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
