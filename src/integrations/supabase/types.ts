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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_escalation_settings: {
        Row: {
          client_id: string | null
          created_at: string
          escalate_to_role: string
          escalation_minutes: number
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          escalate_to_role?: string
          escalation_minutes?: number
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          escalate_to_role?: string
          escalation_minutes?: number
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_escalation_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_escalation_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      application_logs: {
        Row: {
          action: string | null
          context: Json | null
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          execution_id: string | null
          id: string
          level: string
          message: string
          module: string
          user_id: string | null
        }
        Insert: {
          action?: string | null
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          execution_id?: string | null
          id?: string
          level: string
          message: string
          module: string
          user_id?: string | null
        }
        Update: {
          action?: string | null
          context?: Json | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          execution_id?: string | null
          id?: string
          level?: string
          message?: string
          module?: string
          user_id?: string | null
        }
        Relationships: []
      }
      article_feedback: {
        Row: {
          article_id: string
          comment: string | null
          created_at: string | null
          id: string
          is_helpful: boolean
          user_id: string
        }
        Insert: {
          article_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          is_helpful: boolean
          user_id: string
        }
        Update: {
          article_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          is_helpful?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          brand: string | null
          client_id: string
          created_at: string
          id: string
          ip_address: string | null
          location: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          responsible_contact: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          brand?: string | null
          client_id: string
          created_at?: string
          id?: string
          ip_address?: string | null
          location?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          responsible_contact?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          brand?: string | null
          client_id?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          location?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          responsible_contact?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_responsible_contact_fkey"
            columns: ["responsible_contact"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          created_at: string
          criteria: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          criteria?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          criteria?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          account_type: string | null
          agency: string | null
          bank_name: string | null
          created_at: string
          current_balance: number
          id: string
          initial_balance: number
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          initial_balance?: number
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          account_type?: string | null
          agency?: string | null
          bank_name?: string | null
          created_at?: string
          current_balance?: number
          id?: string
          initial_balance?: number
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_reconciliation: {
        Row: {
          bank_account_id: string | null
          bank_amount: number
          bank_date: string
          bank_description: string
          bank_reference: string | null
          created_at: string
          financial_entry_id: string | null
          id: string
          invoice_id: string | null
          match_candidates: Json | null
          match_score: number | null
          matched_at: string | null
          matched_by: string | null
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bank_account_id?: string | null
          bank_amount: number
          bank_date: string
          bank_description: string
          bank_reference?: string | null
          created_at?: string
          financial_entry_id?: string | null
          id?: string
          invoice_id?: string | null
          match_candidates?: Json | null
          match_score?: number | null
          matched_at?: string | null
          matched_by?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bank_account_id?: string | null
          bank_amount?: number
          bank_date?: string
          bank_description?: string
          bank_reference?: string | null
          created_at?: string
          financial_entry_id?: string | null
          id?: string
          invoice_id?: string | null
          match_candidates?: Json | null
          match_score?: number | null
          matched_at?: string | null
          matched_by?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliation_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          client_id: string | null
          color: string | null
          created_at: string
          description: string | null
          end_time: string
          event_type: Database["public"]["Enums"]["event_type"]
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          invoice_id: string | null
          location: string | null
          reminder_sent: boolean
          start_time: string
          ticket_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          client_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          end_time: string
          event_type?: Database["public"]["Enums"]["event_type"]
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          invoice_id?: string | null
          location?: string | null
          reminder_sent?: boolean
          start_time: string
          ticket_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          client_id?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          end_time?: string
          event_type?: Database["public"]["Enums"]["event_type"]
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          invoice_id?: string | null
          location?: string | null
          reminder_sent?: boolean
          start_time?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          arquivo_url: string | null
          company_id: string | null
          created_at: string | null
          descricao: string | null
          emissor: string | null
          id: string
          is_primary: boolean | null
          nome: string
          numero_serie: string | null
          senha_hash: string | null
          tipo: string | null
          titular: string | null
          updated_at: string | null
          uploaded_at: string | null
          validade: string | null
        }
        Insert: {
          arquivo_url?: string | null
          company_id?: string | null
          created_at?: string | null
          descricao?: string | null
          emissor?: string | null
          id?: string
          is_primary?: boolean | null
          nome: string
          numero_serie?: string | null
          senha_hash?: string | null
          tipo?: string | null
          titular?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          validade?: string | null
        }
        Update: {
          arquivo_url?: string | null
          company_id?: string | null
          created_at?: string | null
          descricao?: string | null
          emissor?: string | null
          id?: string
          is_primary?: boolean | null
          nome?: string
          numero_serie?: string | null
          senha_hash?: string | null
          tipo?: string | null
          titular?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_settings_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          name: string
          notify_whatsapp: boolean | null
          phone: string | null
          role: string | null
          user_id: string | null
          username: string | null
          whatsapp: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name: string
          notify_whatsapp?: boolean | null
          phone?: string | null
          role?: string | null
          user_id?: string | null
          username?: string | null
          whatsapp?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          name?: string
          notify_whatsapp?: boolean | null
          phone?: string | null
          role?: string | null
          user_id?: string | null
          username?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      client_external_mappings: {
        Row: {
          client_id: string
          created_at: string
          external_id: string
          external_name: string | null
          external_source: string
          id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          external_id: string
          external_name?: string | null
          external_source: string
          id?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          external_id?: string
          external_name?: string | null
          external_source?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_external_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_external_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      client_history: {
        Row: {
          action: string
          changes: Json | null
          client_id: string
          comment: string | null
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          client_id: string
          comment?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          client_id?: string
          comment?: string | null
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notification_rules: {
        Row: {
          client_id: string
          created_at: string
          id: string
          notify_email: boolean
          notify_on_critical: boolean
          notify_on_info: boolean
          notify_on_warning: boolean
          notify_push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          notify_email?: boolean
          notify_on_critical?: boolean
          notify_on_info?: boolean
          notify_on_warning?: boolean
          notify_push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          notify_email?: boolean
          notify_on_critical?: boolean
          notify_on_info?: boolean
          notify_on_warning?: boolean
          notify_push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notification_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notification_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      client_technicians: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_technicians_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_technicians_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          asaas_customer_id: string | null
          city: string | null
          created_at: string
          document: string | null
          documentation: string | null
          email: string | null
          financial_email: string | null
          id: string
          is_active: boolean
          name: string
          nickname: string | null
          notes: string | null
          phone: string | null
          state: string | null
          state_registration: string | null
          trade_name: string | null
          updated_at: string
          whatsapp: string | null
          whatsapp_validated: boolean | null
          whatsapp_validated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          asaas_customer_id?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          documentation?: string | null
          email?: string | null
          financial_email?: string | null
          id?: string
          is_active?: boolean
          name: string
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          trade_name?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_validated?: boolean | null
          whatsapp_validated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          asaas_customer_id?: string | null
          city?: string | null
          created_at?: string
          document?: string | null
          documentation?: string | null
          email?: string | null
          financial_email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          state_registration?: string | null
          trade_name?: string | null
          updated_at?: string
          whatsapp?: string | null
          whatsapp_validated?: boolean | null
          whatsapp_validated_at?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          business_hours: Json | null
          certificado_arquivo_url: string | null
          certificado_senha_hash: string | null
          certificado_tipo: string | null
          certificado_uploaded_at: string | null
          certificado_validade: string | null
          cnpj: string
          created_at: string | null
          email: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_codigo_ibge: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_uf: string | null
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          nfse_aliquota_padrao: number | null
          nfse_ambiente: string | null
          nfse_cnae_padrao: string | null
          nfse_codigo_tributacao_padrao: string | null
          nfse_descricao_servico_padrao: string | null
          nfse_incentivador_cultural: boolean | null
          nfse_optante_simples: boolean | null
          nfse_regime_tributario: string | null
          nome_fantasia: string | null
          razao_social: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          business_hours?: Json | null
          certificado_arquivo_url?: string | null
          certificado_senha_hash?: string | null
          certificado_tipo?: string | null
          certificado_uploaded_at?: string | null
          certificado_validade?: string | null
          cnpj?: string
          created_at?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_codigo_ibge?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          nfse_aliquota_padrao?: number | null
          nfse_ambiente?: string | null
          nfse_cnae_padrao?: string | null
          nfse_codigo_tributacao_padrao?: string | null
          nfse_descricao_servico_padrao?: string | null
          nfse_incentivador_cultural?: boolean | null
          nfse_optante_simples?: boolean | null
          nfse_regime_tributario?: string | null
          nome_fantasia?: string | null
          razao_social?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          business_hours?: Json | null
          certificado_arquivo_url?: string | null
          certificado_senha_hash?: string | null
          certificado_tipo?: string | null
          certificado_uploaded_at?: string | null
          certificado_validade?: string | null
          cnpj?: string
          created_at?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_codigo_ibge?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          nfse_aliquota_padrao?: number | null
          nfse_ambiente?: string | null
          nfse_cnae_padrao?: string | null
          nfse_codigo_tributacao_padrao?: string | null
          nfse_descricao_servico_padrao?: string | null
          nfse_incentivador_cultural?: boolean | null
          nfse_optante_simples?: boolean | null
          nfse_regime_tributario?: string | null
          nome_fantasia?: string | null
          razao_social?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contract_additional_charges: {
        Row: {
          amount: number
          applied: boolean | null
          applied_invoice_id: string | null
          contract_id: string
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          reference_month: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          applied?: boolean | null
          applied_invoice_id?: string | null
          contract_id: string
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          reference_month: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          applied?: boolean | null
          applied_invoice_id?: string | null
          contract_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          reference_month?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_additional_charges_applied_invoice_id_fkey"
            columns: ["applied_invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_additional_charges_applied_invoice_id_fkey"
            columns: ["applied_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_additional_charges_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_adjustments: {
        Row: {
          adjustment_date: string
          applied_by: string | null
          contract_id: string
          created_at: string | null
          id: string
          index_used: string
          index_value: number
          new_monthly_value: number
          notes: string | null
          old_monthly_value: number
        }
        Insert: {
          adjustment_date: string
          applied_by?: string | null
          contract_id: string
          created_at?: string | null
          id?: string
          index_used: string
          index_value: number
          new_monthly_value: number
          notes?: string | null
          old_monthly_value: number
        }
        Update: {
          adjustment_date?: string
          applied_by?: string | null
          contract_id?: string
          created_at?: string | null
          id?: string
          index_used?: string
          index_value?: number
          new_monthly_value?: number
          notes?: string | null
          old_monthly_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_adjustments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_history: {
        Row: {
          action: string
          changes: Json | null
          comment: string | null
          contract_id: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          comment?: string | null
          contract_id: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          comment?: string | null
          contract_id?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_service_history: {
        Row: {
          action: string
          contract_id: string
          created_at: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          service_id: string | null
          service_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          contract_id: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          service_id?: string | null
          service_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          contract_id?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          service_id?: string | null
          service_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_service_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_service_history_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_services: {
        Row: {
          contract_id: string
          created_at: string
          description: string | null
          id: string
          multiplier_override: number | null
          name: string
          quantity: number | null
          service_id: string | null
          unit_value: number | null
          value: number
        }
        Insert: {
          contract_id: string
          created_at?: string
          description?: string | null
          id?: string
          multiplier_override?: number | null
          name: string
          quantity?: number | null
          service_id?: string | null
          unit_value?: number | null
          value?: number
        }
        Update: {
          contract_id?: string
          created_at?: string
          description?: string | null
          id?: string
          multiplier_override?: number | null
          name?: string
          quantity?: number | null
          service_id?: string | null
          unit_value?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          adjustment_date: string | null
          adjustment_index: string | null
          adjustment_percentage: number | null
          auto_renew: boolean
          billing_day: number | null
          billing_provider: string | null
          client_id: string
          created_at: string
          days_before_due: number | null
          description: string | null
          end_date: string | null
          first_billing_month: string | null
          hours_included: number | null
          id: string
          internal_notes: string | null
          monthly_value: number
          name: string
          nfse_aliquota: number | null
          nfse_cnae: string | null
          nfse_descricao_customizada: string | null
          nfse_enabled: boolean | null
          nfse_iss_retido: boolean | null
          nfse_service_code: string | null
          nfse_service_code_id: string | null
          notification_message: string | null
          payment_preference: string | null
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          support_model: Database["public"]["Enums"]["support_model"]
          updated_at: string
        }
        Insert: {
          adjustment_date?: string | null
          adjustment_index?: string | null
          adjustment_percentage?: number | null
          auto_renew?: boolean
          billing_day?: number | null
          billing_provider?: string | null
          client_id: string
          created_at?: string
          days_before_due?: number | null
          description?: string | null
          end_date?: string | null
          first_billing_month?: string | null
          hours_included?: number | null
          id?: string
          internal_notes?: string | null
          monthly_value?: number
          name: string
          nfse_aliquota?: number | null
          nfse_cnae?: string | null
          nfse_descricao_customizada?: string | null
          nfse_enabled?: boolean | null
          nfse_iss_retido?: boolean | null
          nfse_service_code?: string | null
          nfse_service_code_id?: string | null
          notification_message?: string | null
          payment_preference?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          support_model?: Database["public"]["Enums"]["support_model"]
          updated_at?: string
        }
        Update: {
          adjustment_date?: string | null
          adjustment_index?: string | null
          adjustment_percentage?: number | null
          auto_renew?: boolean
          billing_day?: number | null
          billing_provider?: string | null
          client_id?: string
          created_at?: string
          days_before_due?: number | null
          description?: string | null
          end_date?: string | null
          first_billing_month?: string | null
          hours_included?: number | null
          id?: string
          internal_notes?: string | null
          monthly_value?: number
          name?: string
          nfse_aliquota?: number | null
          nfse_cnae?: string | null
          nfse_descricao_customizada?: string | null
          nfse_enabled?: boolean | null
          nfse_iss_retido?: boolean | null
          nfse_service_code?: string | null
          nfse_service_code_id?: string | null
          notification_message?: string | null
          payment_preference?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          support_model?: Database["public"]["Enums"]["support_model"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_nfse_service_code_id_fkey"
            columns: ["nfse_service_code_id"]
            isOneToOne: false
            referencedRelation: "nfse_service_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      department_members: {
        Row: {
          created_at: string | null
          department_id: string
          id: string
          is_lead: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department_id: string
          id?: string
          is_lead?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          department_id?: string
          id?: string
          is_lead?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          manager_id: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      doc_access_policies: {
        Row: {
          affected_group: string | null
          client_id: string
          configured_via: string | null
          created_at: string
          exceptions: string | null
          id: string
          notes: string | null
          policy_type: string | null
          reason: string | null
          target: string | null
          unifi_rule_id: string | null
          updated_at: string
        }
        Insert: {
          affected_group?: string | null
          client_id: string
          configured_via?: string | null
          created_at?: string
          exceptions?: string | null
          id?: string
          notes?: string | null
          policy_type?: string | null
          reason?: string | null
          target?: string | null
          unifi_rule_id?: string | null
          updated_at?: string
        }
        Update: {
          affected_group?: string | null
          client_id?: string
          configured_via?: string | null
          created_at?: string
          exceptions?: string | null
          id?: string
          notes?: string | null
          policy_type?: string | null
          reason?: string | null
          target?: string | null
          unifi_rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_access_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_access_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_antivirus_solutions: {
        Row: {
          client_id: string
          console_url: string | null
          created_at: string
          credential_id: string | null
          id: string
          notes: string | null
          scope: string | null
          solution: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          client_id: string
          console_url?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          notes?: string | null
          scope?: string | null
          solution?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          client_id?: string
          console_url?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          notes?: string | null
          scope?: string | null
          solution?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_antivirus_solutions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_antivirus_solutions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_antivirus_solutions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_backup_solutions: {
        Row: {
          backup_type: string | null
          client_id: string
          created_at: string
          credential_id: string | null
          destination: string | null
          frequency: string | null
          id: string
          last_verified: string | null
          notes: string | null
          retention: string | null
          solution: string | null
          updated_at: string
        }
        Insert: {
          backup_type?: string | null
          client_id: string
          created_at?: string
          credential_id?: string | null
          destination?: string | null
          frequency?: string | null
          id?: string
          last_verified?: string | null
          notes?: string | null
          retention?: string | null
          solution?: string | null
          updated_at?: string
        }
        Update: {
          backup_type?: string | null
          client_id?: string
          created_at?: string
          credential_id?: string | null
          destination?: string | null
          frequency?: string | null
          id?: string
          last_verified?: string | null
          notes?: string | null
          retention?: string | null
          solution?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_backup_solutions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_backup_solutions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_backup_solutions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_cftv: {
        Row: {
          brand_model: string | null
          camera_type: string | null
          channels: number | null
          client_id: string
          created_at: string
          credential_id: string | null
          device_type: string | null
          id: string
          ip: string | null
          name: string | null
          notes: string | null
          nvr_channel: number | null
          nvr_id: string | null
          physical_location: string | null
          power_type: string | null
          remote_access: string | null
          resolution: string | null
          retention_days: number | null
          storage_size: string | null
          updated_at: string
        }
        Insert: {
          brand_model?: string | null
          camera_type?: string | null
          channels?: number | null
          client_id: string
          created_at?: string
          credential_id?: string | null
          device_type?: string | null
          id?: string
          ip?: string | null
          name?: string | null
          notes?: string | null
          nvr_channel?: number | null
          nvr_id?: string | null
          physical_location?: string | null
          power_type?: string | null
          remote_access?: string | null
          resolution?: string | null
          retention_days?: number | null
          storage_size?: string | null
          updated_at?: string
        }
        Update: {
          brand_model?: string | null
          camera_type?: string | null
          channels?: number | null
          client_id?: string
          created_at?: string
          credential_id?: string | null
          device_type?: string | null
          id?: string
          ip?: string | null
          name?: string | null
          notes?: string | null
          nvr_channel?: number | null
          nvr_id?: string | null
          physical_location?: string | null
          power_type?: string | null
          remote_access?: string | null
          resolution?: string | null
          retention_days?: number | null
          storage_size?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_cftv_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_cftv_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_cftv_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_cftv_nvr_id_fkey"
            columns: ["nvr_id"]
            isOneToOne: false
            referencedRelation: "doc_cftv"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_contacts: {
        Row: {
          availability: string | null
          client_id: string
          created_at: string
          email: string | null
          id: string
          is_emergency: boolean | null
          name: string | null
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          availability?: string | null
          client_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_emergency?: boolean | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          availability?: string | null
          client_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_emergency?: boolean | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_credentials: {
        Row: {
          access_type: string | null
          client_id: string
          created_at: string
          id: string
          mfa_backup_code: string | null
          mfa_enabled: boolean | null
          mfa_type: string | null
          notes: string | null
          password_encrypted: string | null
          port: string | null
          system_name: string | null
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          access_type?: string | null
          client_id: string
          created_at?: string
          id?: string
          mfa_backup_code?: string | null
          mfa_enabled?: boolean | null
          mfa_type?: string | null
          notes?: string | null
          password_encrypted?: string | null
          port?: string | null
          system_name?: string | null
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          access_type?: string | null
          client_id?: string
          created_at?: string
          id?: string
          mfa_backup_code?: string | null
          mfa_enabled?: boolean | null
          mfa_type?: string | null
          notes?: string | null
          password_encrypted?: string | null
          port?: string | null
          system_name?: string | null
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_devices: {
        Row: {
          brand_model: string | null
          client_id: string
          connected_clients: number | null
          connection_type: string | null
          consumable: string | null
          cpu: string | null
          created_at: string
          data_source: string | null
          device_type: string | null
          disks: string | null
          firmware: string | null
          id: string
          integrated_software: string | null
          ip_local: string | null
          last_seen: string | null
          mac_address: string | null
          name: string | null
          notes: string | null
          os: string | null
          physical_location: string | null
          port_count: number | null
          primary_user: string | null
          ram: string | null
          reading_type: string | null
          serial_number: string | null
          ssids: string | null
          status: string | null
          trmm_agent_id: string | null
          unifi_device_id: string | null
          updated_at: string
          usage: string | null
          vlans: string | null
        }
        Insert: {
          brand_model?: string | null
          client_id: string
          connected_clients?: number | null
          connection_type?: string | null
          consumable?: string | null
          cpu?: string | null
          created_at?: string
          data_source?: string | null
          device_type?: string | null
          disks?: string | null
          firmware?: string | null
          id?: string
          integrated_software?: string | null
          ip_local?: string | null
          last_seen?: string | null
          mac_address?: string | null
          name?: string | null
          notes?: string | null
          os?: string | null
          physical_location?: string | null
          port_count?: number | null
          primary_user?: string | null
          ram?: string | null
          reading_type?: string | null
          serial_number?: string | null
          ssids?: string | null
          status?: string | null
          trmm_agent_id?: string | null
          unifi_device_id?: string | null
          updated_at?: string
          usage?: string | null
          vlans?: string | null
        }
        Update: {
          brand_model?: string | null
          client_id?: string
          connected_clients?: number | null
          connection_type?: string | null
          consumable?: string | null
          cpu?: string | null
          created_at?: string
          data_source?: string | null
          device_type?: string | null
          disks?: string | null
          firmware?: string | null
          id?: string
          integrated_software?: string | null
          ip_local?: string | null
          last_seen?: string | null
          mac_address?: string | null
          name?: string | null
          notes?: string | null
          os?: string | null
          physical_location?: string | null
          port_count?: number | null
          primary_user?: string | null
          ram?: string | null
          reading_type?: string | null
          serial_number?: string | null
          ssids?: string | null
          status?: string | null
          trmm_agent_id?: string | null
          unifi_device_id?: string | null
          updated_at?: string
          usage?: string | null
          vlans?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_domains: {
        Row: {
          alert_days: number | null
          client_id: string
          created_at: string
          dns_credential_id: string | null
          dns_panel_url: string | null
          dns_provider: string | null
          domain: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          registrar: string | null
          registrar_credential_id: string | null
          registrar_panel_url: string | null
          updated_at: string
        }
        Insert: {
          alert_days?: number | null
          client_id: string
          created_at?: string
          dns_credential_id?: string | null
          dns_panel_url?: string | null
          dns_provider?: string | null
          domain?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          registrar?: string | null
          registrar_credential_id?: string | null
          registrar_panel_url?: string | null
          updated_at?: string
        }
        Update: {
          alert_days?: number | null
          client_id?: string
          created_at?: string
          dns_credential_id?: string | null
          dns_panel_url?: string | null
          dns_provider?: string | null
          domain?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          registrar?: string | null
          registrar_credential_id?: string | null
          registrar_panel_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_domains_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_domains_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_domains_dns_credential_id_fkey"
            columns: ["dns_credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_domains_registrar_credential_id_fkey"
            columns: ["registrar_credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_external_providers: {
        Row: {
          client_id: string
          company_name: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_expiry: string | null
          contract_type: string | null
          created_at: string
          credential_id: string | null
          id: string
          notes: string | null
          panel_url: string | null
          service_type: string | null
          support_hours: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_expiry?: string | null
          contract_type?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          notes?: string | null
          panel_url?: string | null
          service_type?: string | null
          support_hours?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_expiry?: string | null
          contract_type?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          notes?: string | null
          panel_url?: string | null
          service_type?: string | null
          support_hours?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_external_providers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_external_providers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_external_providers_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_firewall_rules: {
        Row: {
          action: string | null
          client_id: string
          context: string | null
          created_at: string
          data_source: string | null
          destination: string | null
          id: string
          name: string | null
          notes: string | null
          port: string | null
          protocol: string | null
          rule_type: string | null
          source: string | null
          unifi_rule_id: string | null
          updated_at: string
        }
        Insert: {
          action?: string | null
          client_id: string
          context?: string | null
          created_at?: string
          data_source?: string | null
          destination?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          port?: string | null
          protocol?: string | null
          rule_type?: string | null
          source?: string | null
          unifi_rule_id?: string | null
          updated_at?: string
        }
        Update: {
          action?: string | null
          client_id?: string
          context?: string | null
          created_at?: string
          data_source?: string | null
          destination?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          port?: string | null
          protocol?: string | null
          rule_type?: string | null
          source?: string | null
          unifi_rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_firewall_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_firewall_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_infrastructure: {
        Row: {
          active_directory: string | null
          ad_location: string | null
          client_id: string
          cloud_provider: string | null
          created_at: string
          file_server: string | null
          gateway_firmware: string | null
          gateway_ip_lan: string | null
          gateway_ip_wan: string | null
          gateway_model: string | null
          id: string
          notes: string | null
          server_type: string | null
          unifi_admin_credential_id: string | null
          unifi_console_ip: string | null
          unifi_console_model: string | null
          unifi_firmware: string | null
          unifi_uptime: string | null
          updated_at: string
        }
        Insert: {
          active_directory?: string | null
          ad_location?: string | null
          client_id: string
          cloud_provider?: string | null
          created_at?: string
          file_server?: string | null
          gateway_firmware?: string | null
          gateway_ip_lan?: string | null
          gateway_ip_wan?: string | null
          gateway_model?: string | null
          id?: string
          notes?: string | null
          server_type?: string | null
          unifi_admin_credential_id?: string | null
          unifi_console_ip?: string | null
          unifi_console_model?: string | null
          unifi_firmware?: string | null
          unifi_uptime?: string | null
          updated_at?: string
        }
        Update: {
          active_directory?: string | null
          ad_location?: string | null
          client_id?: string
          cloud_provider?: string | null
          created_at?: string
          file_server?: string | null
          gateway_firmware?: string | null
          gateway_ip_lan?: string | null
          gateway_ip_wan?: string | null
          gateway_model?: string | null
          id?: string
          notes?: string | null
          server_type?: string | null
          unifi_admin_credential_id?: string | null
          unifi_console_ip?: string | null
          unifi_console_model?: string | null
          unifi_firmware?: string | null
          unifi_uptime?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_infrastructure_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_infrastructure_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_infrastructure_unifi_admin_credential_id_fkey"
            columns: ["unifi_admin_credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_internet_links: {
        Row: {
          alert_days: number | null
          client_id: string
          contract_expiry: string | null
          created_at: string
          id: string
          link_type: string | null
          notes: string | null
          plan_speed: string | null
          provider: string | null
          public_ip: string | null
          support_phone: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          alert_days?: number | null
          client_id: string
          contract_expiry?: string | null
          created_at?: string
          id?: string
          link_type?: string | null
          notes?: string | null
          plan_speed?: string | null
          provider?: string | null
          public_ip?: string | null
          support_phone?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          alert_days?: number | null
          client_id?: string
          contract_expiry?: string | null
          created_at?: string
          id?: string
          link_type?: string | null
          notes?: string | null
          plan_speed?: string | null
          provider?: string | null
          public_ip?: string | null
          support_phone?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_internet_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_internet_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_licenses: {
        Row: {
          alert_days: number | null
          client_id: string
          cloud_console_url: string | null
          created_at: string
          devices_covered: number | null
          expiry_date: string | null
          id: string
          key: string | null
          license_model: string | null
          license_type: string | null
          linked_device: string | null
          linked_email: string | null
          months_contracted: number | null
          notes: string | null
          product_name: string | null
          quantity_in_use: number | null
          quantity_total: number | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          alert_days?: number | null
          client_id: string
          cloud_console_url?: string | null
          created_at?: string
          devices_covered?: number | null
          expiry_date?: string | null
          id?: string
          key?: string | null
          license_model?: string | null
          license_type?: string | null
          linked_device?: string | null
          linked_email?: string | null
          months_contracted?: number | null
          notes?: string | null
          product_name?: string | null
          quantity_in_use?: number | null
          quantity_total?: number | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          alert_days?: number | null
          client_id?: string
          cloud_console_url?: string | null
          created_at?: string
          devices_covered?: number | null
          expiry_date?: string | null
          id?: string
          key?: string | null
          license_model?: string | null
          license_type?: string | null
          linked_device?: string | null
          linked_email?: string | null
          months_contracted?: number | null
          notes?: string | null
          product_name?: string | null
          quantity_in_use?: number | null
          quantity_total?: number | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_routines: {
        Row: {
          client_id: string
          created_at: string
          frequency: string | null
          id: string
          last_executed: string | null
          name: string | null
          notes: string | null
          procedure: string | null
          responsible: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          frequency?: string | null
          id?: string
          last_executed?: string | null
          name?: string | null
          notes?: string | null
          procedure?: string | null
          responsible?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          frequency?: string | null
          id?: string
          last_executed?: string | null
          name?: string | null
          notes?: string | null
          procedure?: string | null
          responsible?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_routines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_routines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_software_erp: {
        Row: {
          access_url: string | null
          category: string | null
          client_id: string
          created_at: string
          credential_id: string | null
          id: string
          name: string | null
          notes: string | null
          support_contract: string | null
          support_expiry: string | null
          support_hours: string | null
          trmm_software_match: string | null
          updated_at: string
          vendor: string | null
          vendor_email: string | null
          vendor_phone: string | null
          version: string | null
        }
        Insert: {
          access_url?: string | null
          category?: string | null
          client_id: string
          created_at?: string
          credential_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          support_contract?: string | null
          support_expiry?: string | null
          support_hours?: string | null
          trmm_software_match?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_email?: string | null
          vendor_phone?: string | null
          version?: string | null
        }
        Update: {
          access_url?: string | null
          category?: string | null
          client_id?: string
          created_at?: string
          credential_id?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          support_contract?: string | null
          support_expiry?: string | null
          support_hours?: string | null
          trmm_software_match?: string | null
          updated_at?: string
          vendor?: string | null
          vendor_email?: string | null
          vendor_phone?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_software_erp_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_software_erp_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_software_erp_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "doc_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_support_hours: {
        Row: {
          business_hours: string | null
          client_id: string
          created_at: string
          has_oncall: boolean | null
          id: string
          notes: string | null
          oncall_phone: string | null
          sla_critical: string | null
          sla_normal: string | null
          updated_at: string
        }
        Insert: {
          business_hours?: string | null
          client_id: string
          created_at?: string
          has_oncall?: boolean | null
          id?: string
          notes?: string | null
          oncall_phone?: string | null
          sla_critical?: string | null
          sla_normal?: string | null
          updated_at?: string
        }
        Update: {
          business_hours?: string | null
          client_id?: string
          created_at?: string
          has_oncall?: boolean | null
          id?: string
          notes?: string | null
          oncall_phone?: string | null
          sla_critical?: string | null
          sla_normal?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_support_hours_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_support_hours_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_telephony: {
        Row: {
          client_id: string
          created_at: string
          extensions_count: number | null
          id: string
          notes: string | null
          provider: string | null
          support_phone: string | null
          system: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          extensions_count?: number | null
          id?: string
          notes?: string | null
          provider?: string | null
          support_phone?: string | null
          system?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          extensions_count?: number | null
          id?: string
          notes?: string | null
          provider?: string | null
          support_phone?: string | null
          system?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doc_telephony_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_telephony_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_vlans: {
        Row: {
          client_id: string
          created_at: string
          data_source: string | null
          dhcp_enabled: boolean | null
          gateway: string | null
          id: string
          ip_range: string | null
          isolated: boolean | null
          name: string | null
          notes: string | null
          purpose: string | null
          unifi_network_id: string | null
          updated_at: string
          vlan_id: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          data_source?: string | null
          dhcp_enabled?: boolean | null
          gateway?: string | null
          id?: string
          ip_range?: string | null
          isolated?: boolean | null
          name?: string | null
          notes?: string | null
          purpose?: string | null
          unifi_network_id?: string | null
          updated_at?: string
          vlan_id?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          data_source?: string | null
          dhcp_enabled?: boolean | null
          gateway?: string | null
          id?: string
          ip_range?: string | null
          isolated?: boolean | null
          name?: string | null
          notes?: string | null
          purpose?: string | null
          unifi_network_id?: string | null
          updated_at?: string
          vlan_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_vlans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_vlans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_vpn: {
        Row: {
          client_id: string
          created_at: string
          data_source: string | null
          id: string
          name: string | null
          notes: string | null
          port: string | null
          protocol: string | null
          server: string | null
          unifi_vpn_id: string | null
          updated_at: string
          users_configured: string | null
          vpn_type: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          data_source?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          port?: string | null
          protocol?: string | null
          server?: string | null
          unifi_vpn_id?: string | null
          updated_at?: string
          users_configured?: string | null
          vpn_type?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          data_source?: string | null
          id?: string
          name?: string | null
          notes?: string | null
          port?: string | null
          protocol?: string | null
          server?: string | null
          unifi_vpn_id?: string | null
          updated_at?: string
          users_configured?: string | null
          vpn_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doc_vpn_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doc_vpn_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_indices: {
        Row: {
          accumulated_12m: number | null
          created_at: string
          fetched_at: string
          id: string
          index_type: string
          reference_date: string
          source: string | null
          value: number
        }
        Insert: {
          accumulated_12m?: number | null
          created_at?: string
          fetched_at?: string
          id?: string
          index_type: string
          reference_date: string
          source?: string | null
          value: number
        }
        Update: {
          accumulated_12m?: number | null
          created_at?: string
          fetched_at?: string
          id?: string
          index_type?: string
          reference_date?: string
          source?: string | null
          value?: number
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          created_at: string | null
          footer_text: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          show_social_links: boolean | null
          social_links: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          footer_text?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_social_links?: boolean | null
          social_links?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          footer_text?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_social_links?: boolean | null
          social_links?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string | null
          html_template: string
          id: string
          is_active: boolean | null
          name: string
          subject_template: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          html_template: string
          id?: string
          is_active?: boolean | null
          name: string
          subject_template: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          html_template?: string
          id?: string
          is_active?: boolean | null
          name?: string
          subject_template?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_entries: {
        Row: {
          amount: number
          category: string | null
          client_id: string | null
          cost_center_id: string | null
          created_at: string
          date: string
          description: string
          id: string
          invoice_id: string | null
          is_reconciled: boolean
          type: string
        }
        Insert: {
          amount: number
          category?: string | null
          client_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          date: string
          description: string
          id?: string
          invoice_id?: string | null
          is_reconciled?: boolean
          type: string
        }
        Update: {
          amount?: number
          category?: string | null
          client_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          date?: string
          description?: string
          id?: string
          invoice_id?: string | null
          is_reconciled?: boolean
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_incident_slas: {
        Row: {
          created_at: string
          escalation_role: string
          id: string
          incident_type: Database["public"]["Enums"]["incident_type_enum"]
          is_active: boolean
          notification_template: string | null
          resolution_hours: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          escalation_role?: string
          id?: string
          incident_type: Database["public"]["Enums"]["incident_type_enum"]
          is_active?: boolean
          notification_template?: string | null
          resolution_hours: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          escalation_role?: string
          id?: string
          incident_type?: Database["public"]["Enums"]["incident_type_enum"]
          is_active?: boolean
          notification_template?: string | null
          resolution_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      gamification_goals: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          period: string
          points_reward: number
          target_value: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          period: string
          points_reward: number
          target_value: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          period?: string
          points_reward?: number
          target_value?: number
        }
        Relationships: []
      }
      google_calendar_integrations: {
        Row: {
          access_token: string | null
          calendar_id: string | null
          created_at: string
          id: string
          last_sync_at: string | null
          refresh_token: string | null
          sync_enabled: boolean
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string | null
          sync_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          refresh_token?: string | null
          sync_enabled?: boolean
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_settings: {
        Row: {
          created_at: string
          id: string
          integration_type: string
          is_active: boolean
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_type: string
          is_active?: boolean
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      invoice_documents: {
        Row: {
          bucket_name: string | null
          created_at: string | null
          document_type: string
          expires_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          invoice_id: string
          metadata: Json | null
          mime_type: string | null
          storage_provider: string | null
        }
        Insert: {
          bucket_name?: string | null
          created_at?: string | null
          document_type: string
          expires_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          invoice_id: string
          metadata?: Json | null
          mime_type?: string | null
          storage_provider?: string | null
        }
        Update: {
          bucket_name?: string | null
          created_at?: string | null
          document_type?: string
          expires_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          invoice_id?: string
          metadata?: Json | null
          mime_type?: string | null
          storage_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_generation_log: {
        Row: {
          contract_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          reference_month: string
          status: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          reference_month: string
          status?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          reference_month?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_generation_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_generation_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_generation_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          total_value: number
          unit_value: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          total_value: number
          unit_value: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          total_value?: number
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_notification_logs: {
        Row: {
          channel: string
          created_by: string | null
          error_message: string | null
          id: string
          invoice_id: string
          notification_type: string
          sent_at: string | null
          success: boolean | null
        }
        Insert: {
          channel: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          invoice_id: string
          notification_type: string
          sent_at?: string | null
          success?: boolean | null
        }
        Update: {
          channel?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string
          notification_type?: string
          sent_at?: string | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_notification_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_notification_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          auto_nfse_emitted: boolean | null
          auto_payment_generated: boolean | null
          billing_provider: string | null
          boleto_barcode: string | null
          boleto_error_msg: string | null
          boleto_sent_at: string | null
          boleto_status:
            | Database["public"]["Enums"]["boleto_processing_status"]
            | null
          boleto_url: string | null
          client_id: string
          contract_id: string | null
          created_at: string
          description: string | null
          due_date: string
          email_error_msg: string | null
          email_sent_at: string | null
          email_status:
            | Database["public"]["Enums"]["email_processing_status"]
            | null
          fine_amount: number | null
          id: string
          installment_number: number | null
          interest_amount: number | null
          invoice_number: number
          manual_payment: boolean | null
          nfse_error_msg: string | null
          nfse_generated_at: string | null
          nfse_status:
            | Database["public"]["Enums"]["nfse_processing_status"]
            | null
          notes: string | null
          paid_amount: number | null
          paid_date: string | null
          parent_invoice_id: string | null
          payment_method: string | null
          payment_notes: string | null
          payment_proof_url: string | null
          pix_code: string | null
          processed_at: string | null
          processing_attempts: number | null
          processing_metadata: Json | null
          reference_month: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          ticket_id: string | null
          total_installments: number | null
          total_with_penalties: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          auto_nfse_emitted?: boolean | null
          auto_payment_generated?: boolean | null
          billing_provider?: string | null
          boleto_barcode?: string | null
          boleto_error_msg?: string | null
          boleto_sent_at?: string | null
          boleto_status?:
            | Database["public"]["Enums"]["boleto_processing_status"]
            | null
          boleto_url?: string | null
          client_id: string
          contract_id?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          email_error_msg?: string | null
          email_sent_at?: string | null
          email_status?:
            | Database["public"]["Enums"]["email_processing_status"]
            | null
          fine_amount?: number | null
          id?: string
          installment_number?: number | null
          interest_amount?: number | null
          invoice_number?: number
          manual_payment?: boolean | null
          nfse_error_msg?: string | null
          nfse_generated_at?: string | null
          nfse_status?:
            | Database["public"]["Enums"]["nfse_processing_status"]
            | null
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          parent_invoice_id?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_proof_url?: string | null
          pix_code?: string | null
          processed_at?: string | null
          processing_attempts?: number | null
          processing_metadata?: Json | null
          reference_month?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          ticket_id?: string | null
          total_installments?: number | null
          total_with_penalties?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          auto_nfse_emitted?: boolean | null
          auto_payment_generated?: boolean | null
          billing_provider?: string | null
          boleto_barcode?: string | null
          boleto_error_msg?: string | null
          boleto_sent_at?: string | null
          boleto_status?:
            | Database["public"]["Enums"]["boleto_processing_status"]
            | null
          boleto_url?: string | null
          client_id?: string
          contract_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          email_error_msg?: string | null
          email_sent_at?: string | null
          email_status?:
            | Database["public"]["Enums"]["email_processing_status"]
            | null
          fine_amount?: number | null
          id?: string
          installment_number?: number | null
          interest_amount?: number | null
          invoice_number?: number
          manual_payment?: boolean | null
          nfse_error_msg?: string | null
          nfse_generated_at?: string | null
          nfse_status?:
            | Database["public"]["Enums"]["nfse_processing_status"]
            | null
          notes?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          parent_invoice_id?: string | null
          payment_method?: string | null
          payment_notes?: string | null
          payment_proof_url?: string | null
          pix_code?: string | null
          processed_at?: string | null
          processing_attempts?: number | null
          processing_metadata?: Json | null
          reference_month?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          ticket_id?: string | null
          total_installments?: number | null
          total_with_penalties?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          author_id: string | null
          category_id: string | null
          client_id: string | null
          content: string
          created_at: string
          excerpt: string | null
          helpful_count: number | null
          id: string
          is_pinned: boolean | null
          is_public: boolean
          knowledge_category_id: string | null
          not_helpful_count: number | null
          order_index: number | null
          slug: string | null
          tags: string[] | null
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          author_id?: string | null
          category_id?: string | null
          client_id?: string | null
          content: string
          created_at?: string
          excerpt?: string | null
          helpful_count?: number | null
          id?: string
          is_pinned?: boolean | null
          is_public?: boolean
          knowledge_category_id?: string | null
          not_helpful_count?: number | null
          order_index?: number | null
          slug?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          author_id?: string | null
          category_id?: string | null
          client_id?: string | null
          content?: string
          created_at?: string
          excerpt?: string | null
          helpful_count?: number | null
          id?: string
          is_pinned?: boolean | null
          is_public?: boolean
          knowledge_category_id?: string | null
          not_helpful_count?: number | null
          order_index?: number | null
          slug?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_knowledge_category"
            columns: ["knowledge_category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_categories: {
        Row: {
          article_count: number | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          order_index: number | null
          parent_id: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          article_count?: number | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          order_index?: number | null
          parent_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          article_count?: number | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          order_index?: number | null
          parent_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      license_assets: {
        Row: {
          asset_id: string
          id: string
          installed_at: string
          license_id: string
        }
        Insert: {
          asset_id: string
          id?: string
          installed_at?: string
          license_id: string
        }
        Update: {
          asset_id?: string
          id?: string
          installed_at?: string
          license_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assets_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assets_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "software_licenses_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenances: {
        Row: {
          asset_id: string
          cost: number | null
          created_at: string
          description: string | null
          downtime_hours: number | null
          id: string
          performed_at: string
          performed_by: string | null
          ticket_id: string | null
          type: string
        }
        Insert: {
          asset_id: string
          cost?: number | null
          created_at?: string
          description?: string | null
          downtime_hours?: number | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          ticket_id?: string | null
          type: string
        }
        Update: {
          asset_id?: string
          cost?: number | null
          created_at?: string
          description?: string | null
          downtime_hours?: number | null
          id?: string
          performed_at?: string
          performed_by?: string | null
          ticket_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenances_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenances_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      message_logs: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          external_message_id: string | null
          id: string
          message: string
          read_at: string | null
          recipient: string
          related_id: string | null
          related_type: string | null
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          message: string
          read_at?: string | null
          recipient: string
          related_id?: string | null
          related_type?: string | null
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          message?: string
          read_at?: string | null
          recipient?: string
          related_id?: string | null
          related_type?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      monitored_devices: {
        Row: {
          asset_id: string | null
          client_id: string
          created_at: string
          device_type: string | null
          external_id: string | null
          external_source: string | null
          firmware_version: string | null
          hostname: string | null
          id: string
          ip_address: string | null
          is_online: boolean
          last_seen_at: string | null
          mac_address: string | null
          model: string | null
          name: string
          needs_reboot: boolean | null
          service_data: Json | null
          site_id: string | null
          updated_at: string
          uptime_percent: number | null
        }
        Insert: {
          asset_id?: string | null
          client_id: string
          created_at?: string
          device_type?: string | null
          external_id?: string | null
          external_source?: string | null
          firmware_version?: string | null
          hostname?: string | null
          id?: string
          ip_address?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          mac_address?: string | null
          model?: string | null
          name: string
          needs_reboot?: boolean | null
          service_data?: Json | null
          site_id?: string | null
          updated_at?: string
          uptime_percent?: number | null
        }
        Update: {
          asset_id?: string | null
          client_id?: string
          created_at?: string
          device_type?: string | null
          external_id?: string | null
          external_source?: string | null
          firmware_version?: string | null
          hostname?: string | null
          id?: string
          ip_address?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          mac_address?: string | null
          model?: string | null
          name?: string
          needs_reboot?: boolean | null
          service_data?: Json | null
          site_id?: string | null
          updated_at?: string
          uptime_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monitored_devices_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_devices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_devices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "network_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          check_output: string | null
          created_at: string
          device_id: string
          escalated_at: string | null
          escalated_to: string | null
          id: string
          level: Database["public"]["Enums"]["alert_level"]
          message: string | null
          resolved_at: string | null
          service_name: string | null
          status: Database["public"]["Enums"]["alert_status"]
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          check_output?: string | null
          created_at?: string
          device_id: string
          escalated_at?: string | null
          escalated_to?: string | null
          id?: string
          level: Database["public"]["Enums"]["alert_level"]
          message?: string | null
          resolved_at?: string | null
          service_name?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          check_output?: string | null
          created_at?: string
          device_id?: string
          escalated_at?: string | null
          escalated_to?: string | null
          id?: string
          level?: Database["public"]["Enums"]["alert_level"]
          message?: string | null
          resolved_at?: string | null
          service_name?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_alerts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "monitored_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      network_sites: {
        Row: {
          client_count: number
          client_id: string
          controller_id: string
          created_at: string
          device_count: number
          health_status: Json | null
          id: string
          last_sync_at: string | null
          site_code: string
          site_name: string
          updated_at: string
        }
        Insert: {
          client_count?: number
          client_id: string
          controller_id: string
          created_at?: string
          device_count?: number
          health_status?: Json | null
          id?: string
          last_sync_at?: string | null
          site_code: string
          site_name: string
          updated_at?: string
        }
        Update: {
          client_count?: number
          client_id?: string
          controller_id?: string
          created_at?: string
          device_count?: number
          health_status?: Json | null
          id?: string
          last_sync_at?: string | null
          site_code?: string
          site_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_sites_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_sites_controller_id_fkey"
            columns: ["controller_id"]
            isOneToOne: false
            referencedRelation: "unifi_controllers"
            referencedColumns: ["id"]
          },
        ]
      }
      network_topology: {
        Row: {
          client_id: string
          connection_type: string
          created_at: string
          device_mac: string
          device_name: string | null
          device_port: string | null
          id: string
          neighbor_mac: string
          neighbor_name: string | null
          neighbor_port: string | null
          site_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          connection_type?: string
          created_at?: string
          device_mac: string
          device_name?: string | null
          device_port?: string | null
          id?: string
          neighbor_mac: string
          neighbor_name?: string | null
          neighbor_port?: string | null
          site_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          connection_type?: string
          created_at?: string
          device_mac?: string
          device_name?: string | null
          device_port?: string | null
          id?: string
          neighbor_mac?: string
          neighbor_name?: string | null
          neighbor_port?: string | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_topology_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_topology_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_topology_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "network_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_cancellation_log: {
        Row: {
          asaas_invoice_id: string | null
          created_at: string
          error_payload: Json | null
          id: string
          invoice_id: string | null
          justification: string
          nfse_history_id: string | null
          request_id: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          asaas_invoice_id?: string | null
          created_at?: string
          error_payload?: Json | null
          id?: string
          invoice_id?: string | null
          justification: string
          nfse_history_id?: string | null
          request_id?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          asaas_invoice_id?: string | null
          created_at?: string
          error_payload?: Json | null
          id?: string
          invoice_id?: string | null
          justification?: string
          nfse_history_id?: string | null
          request_id?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_cancellation_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_cancellation_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_cancellation_log_nfse_history_id_fkey"
            columns: ["nfse_history_id"]
            isOneToOne: false
            referencedRelation: "nfse_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_cancellation_log_nfse_history_id_fkey"
            columns: ["nfse_history_id"]
            isOneToOne: false
            referencedRelation: "nfse_history_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_event_logs: {
        Row: {
          correlation_id: string | null
          created_at: string | null
          details: Json | null
          event_level: string
          event_type: string
          id: string
          message: string
          nfse_history_id: string
          source: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_level?: string
          event_type: string
          id?: string
          message: string
          nfse_history_id: string
          source?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_level?: string
          event_type?: string
          id?: string
          message?: string
          nfse_history_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_event_logs_nfse_history_id_fkey"
            columns: ["nfse_history_id"]
            isOneToOne: false
            referencedRelation: "nfse_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_event_logs_nfse_history_id_fkey"
            columns: ["nfse_history_id"]
            isOneToOne: false
            referencedRelation: "nfse_history_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_history: {
        Row: {
          aliquota: number | null
          ambiente: string | null
          asaas_invoice_id: string | null
          asaas_payment_id: string | null
          asaas_status: string | null
          chave_acesso: string | null
          client_id: string | null
          cnae: string | null
          codigo_retorno: string | null
          codigo_tributacao: string | null
          codigo_verificacao: string | null
          competencia: string
          contract_id: string | null
          created_at: string | null
          danfse_url: string | null
          data_autorizacao: string | null
          data_cancelamento: string | null
          data_emissao: string | null
          descricao_servico: string | null
          emitido_por: string | null
          id: string
          invoice_id: string | null
          iss_retido: boolean | null
          mensagem_retorno: string | null
          motivo_cancelamento: string | null
          municipal_service_id: string | null
          nfse_substituta_id: string | null
          numero_lote: string | null
          numero_nfse: string | null
          pdf_url: string | null
          protocolo: string | null
          provider: string | null
          serie: string | null
          status: string
          updated_at: string | null
          valor_cbs: number | null
          valor_cofins: number | null
          valor_csll: number | null
          valor_deducoes: number | null
          valor_desconto: number | null
          valor_ibs: number | null
          valor_inss: number | null
          valor_irrf: number | null
          valor_iss: number | null
          valor_iss_retido: number | null
          valor_liquido: number | null
          valor_pis: number | null
          valor_servico: number
          xml_url: string | null
        }
        Insert: {
          aliquota?: number | null
          ambiente?: string | null
          asaas_invoice_id?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          chave_acesso?: string | null
          client_id?: string | null
          cnae?: string | null
          codigo_retorno?: string | null
          codigo_tributacao?: string | null
          codigo_verificacao?: string | null
          competencia: string
          contract_id?: string | null
          created_at?: string | null
          danfse_url?: string | null
          data_autorizacao?: string | null
          data_cancelamento?: string | null
          data_emissao?: string | null
          descricao_servico?: string | null
          emitido_por?: string | null
          id?: string
          invoice_id?: string | null
          iss_retido?: boolean | null
          mensagem_retorno?: string | null
          motivo_cancelamento?: string | null
          municipal_service_id?: string | null
          nfse_substituta_id?: string | null
          numero_lote?: string | null
          numero_nfse?: string | null
          pdf_url?: string | null
          protocolo?: string | null
          provider?: string | null
          serie?: string | null
          status?: string
          updated_at?: string | null
          valor_cbs?: number | null
          valor_cofins?: number | null
          valor_csll?: number | null
          valor_deducoes?: number | null
          valor_desconto?: number | null
          valor_ibs?: number | null
          valor_inss?: number | null
          valor_irrf?: number | null
          valor_iss?: number | null
          valor_iss_retido?: number | null
          valor_liquido?: number | null
          valor_pis?: number | null
          valor_servico: number
          xml_url?: string | null
        }
        Update: {
          aliquota?: number | null
          ambiente?: string | null
          asaas_invoice_id?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          chave_acesso?: string | null
          client_id?: string | null
          cnae?: string | null
          codigo_retorno?: string | null
          codigo_tributacao?: string | null
          codigo_verificacao?: string | null
          competencia?: string
          contract_id?: string | null
          created_at?: string | null
          danfse_url?: string | null
          data_autorizacao?: string | null
          data_cancelamento?: string | null
          data_emissao?: string | null
          descricao_servico?: string | null
          emitido_por?: string | null
          id?: string
          invoice_id?: string | null
          iss_retido?: boolean | null
          mensagem_retorno?: string | null
          motivo_cancelamento?: string | null
          municipal_service_id?: string | null
          nfse_substituta_id?: string | null
          numero_lote?: string | null
          numero_nfse?: string | null
          pdf_url?: string | null
          protocolo?: string | null
          provider?: string | null
          serie?: string | null
          status?: string
          updated_at?: string | null
          valor_cbs?: number | null
          valor_cofins?: number | null
          valor_csll?: number | null
          valor_deducoes?: number | null
          valor_desconto?: number | null
          valor_ibs?: number | null
          valor_inss?: number | null
          valor_irrf?: number | null
          valor_iss?: number | null
          valor_iss_retido?: number | null
          valor_liquido?: number | null
          valor_pis?: number | null
          valor_servico?: number
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_nfse_substituta_id_fkey"
            columns: ["nfse_substituta_id"]
            isOneToOne: false
            referencedRelation: "nfse_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_nfse_substituta_id_fkey"
            columns: ["nfse_substituta_id"]
            isOneToOne: false
            referencedRelation: "nfse_history_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      nfse_service_codes: {
        Row: {
          aliquota_sugerida: number | null
          ativo: boolean | null
          categoria: string | null
          cnae_principal: string | null
          codigo_tributacao: string
          created_at: string | null
          descricao: string
          id: string
          item_lista: string | null
          subitem_lista: string | null
        }
        Insert: {
          aliquota_sugerida?: number | null
          ativo?: boolean | null
          categoria?: string | null
          cnae_principal?: string | null
          codigo_tributacao: string
          created_at?: string | null
          descricao: string
          id?: string
          item_lista?: string | null
          subitem_lista?: string | null
        }
        Update: {
          aliquota_sugerida?: number | null
          ativo?: boolean | null
          categoria?: string | null
          cnae_principal?: string | null
          codigo_tributacao?: string
          created_at?: string | null
          descricao?: string
          id?: string
          item_lista?: string | null
          subitem_lista?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          group_count: number | null
          grouped_id: string | null
          id: string
          is_grouped: boolean | null
          is_read: boolean
          message: string
          related_id: string | null
          related_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_count?: number | null
          grouped_id?: string | null
          id?: string
          is_grouped?: boolean | null
          is_read?: boolean
          message: string
          related_id?: string | null
          related_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_count?: number | null
          grouped_id?: string | null
          id?: string
          is_grouped?: boolean | null
          is_read?: boolean
          message?: string
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          notify_email: boolean | null
          notify_telegram: boolean | null
          notify_whatsapp: boolean | null
          phone: string | null
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
          whatsapp_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          notify_email?: boolean | null
          notify_telegram?: boolean | null
          notify_whatsapp?: boolean | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          notify_email?: boolean | null
          notify_telegram?: boolean | null
          notify_whatsapp?: boolean | null
          phone?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      role_permission_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          id: string
          is_allowed: boolean
          module: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_allowed?: boolean
          module: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_allowed?: boolean
          module?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          base_value: number
          c_nat_rend: string | null
          created_at: string | null
          description: string | null
          id: string
          ind_inc_fisc: boolean | null
          is_active: boolean | null
          multiplier: number
          name: string
          nfse_cnae: string | null
          nfse_service_code: string | null
          tax_cofins: number | null
          tax_csll: number | null
          tax_inss: number | null
          tax_irrf: number | null
          tax_iss: number | null
          tax_pis: number | null
          trib_municipio_recolhimento: string | null
          updated_at: string | null
        }
        Insert: {
          base_value?: number
          c_nat_rend?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          ind_inc_fisc?: boolean | null
          is_active?: boolean | null
          multiplier?: number
          name: string
          nfse_cnae?: string | null
          nfse_service_code?: string | null
          tax_cofins?: number | null
          tax_csll?: number | null
          tax_inss?: number | null
          tax_irrf?: number | null
          tax_iss?: number | null
          tax_pis?: number | null
          trib_municipio_recolhimento?: string | null
          updated_at?: string | null
        }
        Update: {
          base_value?: number
          c_nat_rend?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          ind_inc_fisc?: boolean | null
          is_active?: boolean | null
          multiplier?: number
          name?: string
          nfse_cnae?: string | null
          nfse_service_code?: string | null
          tax_cofins?: number | null
          tax_csll?: number | null
          tax_inss?: number | null
          tax_irrf?: number | null
          tax_iss?: number | null
          tax_pis?: number | null
          trib_municipio_recolhimento?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sla_configs: {
        Row: {
          category_id: string | null
          client_id: string | null
          contract_id: string | null
          created_at: string
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_hours: number
          response_hours: number
        }
        Insert: {
          category_id?: string | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_hours?: number
          response_hours?: number
        }
        Update: {
          category_id?: string | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_hours?: number
          response_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_configs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_configs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      software_licenses: {
        Row: {
          client_id: string
          created_at: string
          expire_date: string | null
          id: string
          license_key: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          total_licenses: number
          updated_at: string
          used_licenses: number
          vendor: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          expire_date?: string | null
          id?: string
          license_key?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          total_licenses?: number
          updated_at?: string
          used_licenses?: number
          vendor?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          expire_date?: string | null
          id?: string
          license_key?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          total_licenses?: number
          updated_at?: string
          used_licenses?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "software_licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_config: {
        Row: {
          access_key: string | null
          bucket_name: string
          created_at: string | null
          description: string | null
          endpoint: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          path_prefix: string | null
          provider: string
          region: string | null
          secret_key: string | null
          signed_url_expiry_hours: number | null
          updated_at: string | null
        }
        Insert: {
          access_key?: string | null
          bucket_name: string
          created_at?: string | null
          description?: string | null
          endpoint?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          path_prefix?: string | null
          provider?: string
          region?: string | null
          secret_key?: string | null
          signed_url_expiry_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          access_key?: string | null
          bucket_name?: string
          created_at?: string | null
          description?: string | null
          endpoint?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          path_prefix?: string | null
          provider?: string
          region?: string | null
          secret_key?: string | null
          signed_url_expiry_hours?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      storage_retention_policies: {
        Row: {
          backup_enabled: boolean
          bucket_name: string
          created_at: string
          id: string
          last_audit_at: string | null
          retention_days: number
          updated_at: string
        }
        Insert: {
          backup_enabled?: boolean
          bucket_name: string
          created_at?: string
          id?: string
          last_audit_at?: string | null
          retention_days?: number
          updated_at?: string
        }
        Update: {
          backup_enabled?: boolean
          bucket_name?: string
          created_at?: string
          id?: string
          last_audit_at?: string | null
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      technician_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_points: {
        Row: {
          created_at: string
          id: string
          points: number
          reason: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          points: number
          reason: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          points?: number
          reason?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_points_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attendance_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          started_by: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          started_by: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          started_by?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attendance_sessions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sla_hours: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sla_hours?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sla_hours?: number | null
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          attachments: Json | null
          content: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          attachments?: Json | null
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          attachments?: Json | null
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_history: {
        Row: {
          comment: string | null
          created_at: string
          field_changes: Json | null
          id: string
          new_status: Database["public"]["Enums"]["ticket_status"] | null
          old_status: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          field_changes?: Json | null
          id?: string
          new_status?: Database["public"]["Enums"]["ticket_status"] | null
          old_status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          field_changes?: Json | null
          id?: string
          new_status?: Database["public"]["Enums"]["ticket_status"] | null
          old_status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_history_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_macros: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_internal: boolean | null
          name: string
          shortcut: string | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_internal?: boolean | null
          name: string
          shortcut?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_internal?: boolean | null
          name?: string
          shortcut?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ticket_pauses: {
        Row: {
          auto_resume_at: string | null
          created_at: string | null
          id: string
          pause_reason: string
          pause_type: string
          paused_at: string
          paused_by: string
          resumed_at: string | null
          third_party_name: string | null
          ticket_id: string
        }
        Insert: {
          auto_resume_at?: string | null
          created_at?: string | null
          id?: string
          pause_reason: string
          pause_type: string
          paused_at?: string
          paused_by: string
          resumed_at?: string | null
          third_party_name?: string | null
          ticket_id: string
        }
        Update: {
          auto_resume_at?: string | null
          created_at?: string | null
          id?: string
          pause_reason?: string
          pause_type?: string
          paused_at?: string
          paused_by?: string
          resumed_at?: string | null
          third_party_name?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_pauses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_subcategories: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sla_hours_override: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sla_hours_override?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sla_hours_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tag_assignments: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "ticket_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tag_assignments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      ticket_time_entries: {
        Row: {
          created_at: string | null
          description: string | null
          duration_minutes: number
          ended_at: string | null
          entry_type: string
          id: string
          is_billable: boolean | null
          started_at: string | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          ended_at?: string | null
          entry_type?: string
          id?: string
          is_billable?: boolean | null
          started_at?: string | null
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number
          ended_at?: string | null
          entry_type?: string
          id?: string
          is_billable?: boolean | null
          started_at?: string | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_time_entries_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_transfers: {
        Row: {
          created_at: string | null
          from_department_id: string | null
          from_user_id: string | null
          id: string
          reason: string | null
          ticket_id: string
          to_department_id: string | null
          to_user_id: string | null
          transferred_by: string
        }
        Insert: {
          created_at?: string | null
          from_department_id?: string | null
          from_user_id?: string | null
          id?: string
          reason?: string | null
          ticket_id: string
          to_department_id?: string | null
          to_user_id?: string | null
          transferred_by: string
        }
        Update: {
          created_at?: string | null
          from_department_id?: string | null
          from_user_id?: string | null
          id?: string
          reason?: string | null
          ticket_id?: string
          to_department_id?: string | null
          to_user_id?: string | null
          transferred_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_transfers_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_transfers_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          asset_description: string | null
          asset_id: string | null
          assigned_to: string | null
          category_id: string | null
          client_id: string | null
          closed_at: string | null
          contact_phone: string | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          department_id: string | null
          description: string | null
          first_response_at: string | null
          id: string
          origin: Database["public"]["Enums"]["ticket_origin"]
          priority: Database["public"]["Enums"]["ticket_priority"]
          requester_contact_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          satisfaction_comment: string | null
          satisfaction_rating: number | null
          sla_deadline: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategory_id: string | null
          ticket_number: number
          title: string
          updated_at: string
        }
        Insert: {
          asset_description?: string | null
          asset_id?: string | null
          assigned_to?: string | null
          category_id?: string | null
          client_id?: string | null
          closed_at?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          origin?: Database["public"]["Enums"]["ticket_origin"]
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_contact_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rating?: number | null
          sla_deadline?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory_id?: string | null
          ticket_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          asset_description?: string | null
          asset_id?: string | null
          assigned_to?: string | null
          category_id?: string | null
          client_id?: string | null
          closed_at?: string | null
          contact_phone?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          origin?: Database["public"]["Enums"]["ticket_origin"]
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_contact_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rating?: number | null
          sla_deadline?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory_id?: string | null
          ticket_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_requester_contact_id_fkey"
            columns: ["requester_contact_id"]
            isOneToOne: false
            referencedRelation: "client_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "ticket_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_dashboard_config: {
        Row: {
          access_token: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          rotation_interval: number
          show_metrics: boolean
          show_monitoring: boolean
          show_ranking: boolean
          show_tickets: boolean
          theme: string
          updated_at: string
        }
        Insert: {
          access_token?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          rotation_interval?: number
          show_metrics?: boolean
          show_monitoring?: boolean
          show_ranking?: boolean
          show_tickets?: boolean
          theme?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          rotation_interval?: number
          show_metrics?: boolean
          show_monitoring?: boolean
          show_ranking?: boolean
          show_tickets?: boolean
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      unifi_controllers: {
        Row: {
          client_id: string
          cloud_api_key_encrypted: string | null
          cloud_host_id: string | null
          connection_method: string
          created_at: string
          ddns_hostname: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_sync_at: string | null
          name: string
          password_encrypted: string | null
          sync_interval_hours: number
          updated_at: string
          url: string | null
          username: string | null
        }
        Insert: {
          client_id: string
          cloud_api_key_encrypted?: string | null
          cloud_host_id?: string | null
          connection_method?: string
          created_at?: string
          ddns_hostname?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          name: string
          password_encrypted?: string | null
          sync_interval_hours?: number
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Update: {
          client_id?: string
          cloud_api_key_encrypted?: string | null
          cloud_host_id?: string | null
          connection_method?: string
          created_at?: string
          ddns_hostname?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          password_encrypted?: string | null
          sync_interval_hours?: number
          updated_at?: string
          url?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unifi_controllers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unifi_controllers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
      unifi_sync_logs: {
        Row: {
          alarms_collected: number
          alarms_new: number
          alerts_posted: number
          controller_id: string
          created_at: string
          devices_synced: number
          duration_ms: number | null
          error_message: string | null
          id: string
          status: string
          sync_timestamp: string
        }
        Insert: {
          alarms_collected?: number
          alarms_new?: number
          alerts_posted?: number
          controller_id: string
          created_at?: string
          devices_synced?: number
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          status?: string
          sync_timestamp?: string
        }
        Update: {
          alarms_collected?: number
          alarms_new?: number
          alerts_posted?: number
          controller_id?: string
          created_at?: string
          devices_synced?: number
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          status?: string
          sync_timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "unifi_sync_logs_controller_id_fkey"
            columns: ["controller_id"]
            isOneToOne: false
            referencedRelation: "unifi_controllers"
            referencedColumns: ["id"]
          },
        ]
      }
      uptime_history: {
        Row: {
          checked_at: string
          device_id: string
          id: string
          is_online: boolean
          response_time_ms: number | null
          uptime_percent: number | null
        }
        Insert: {
          checked_at?: string
          device_id: string
          id?: string
          is_online: boolean
          response_time_ms?: number | null
          uptime_percent?: number | null
        }
        Update: {
          checked_at?: string
          device_id?: string
          id?: string
          is_online?: boolean
          response_time_ms?: number | null
          uptime_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uptime_history_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "monitored_devices"
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
      warranties: {
        Row: {
          asset_id: string
          contact_info: string | null
          created_at: string
          end_date: string
          id: string
          provider: string
          start_date: string
          terms: string | null
        }
        Insert: {
          asset_id: string
          contact_info?: string | null
          created_at?: string
          end_date: string
          id?: string
          provider: string
          start_date: string
          terms?: string | null
        }
        Update: {
          asset_id?: string
          contact_info?: string | null
          created_at?: string
          end_date?: string
          id?: string
          provider?: string
          start_date?: string
          terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warranties_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string | null
          id: string
          payload: Json | null
          webhook_source: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          webhook_source: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string | null
          id?: string
          payload?: Json | null
          webhook_source?: string
        }
        Relationships: []
      }
    }
    Views: {
      accounts_receivable: {
        Row: {
          amount: number | null
          ar_status: string | null
          client_id: string | null
          client_name: string | null
          contract_id: string | null
          days_overdue: number | null
          due_date: string | null
          id: string | null
          invoice_number: number | null
          is_overdue: boolean | null
          paid_amount: number | null
          paid_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates_safe: {
        Row: {
          company_id: string | null
          created_at: string | null
          descricao: string | null
          emissor: string | null
          id: string | null
          is_primary: boolean | null
          nome: string | null
          numero_serie: string | null
          tipo: string | null
          titular: string | null
          updated_at: string | null
          uploaded_at: string | null
          validade: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          descricao?: string | null
          emissor?: string | null
          id?: string | null
          is_primary?: boolean | null
          nome?: string | null
          numero_serie?: string | null
          tipo?: string | null
          titular?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          validade?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          descricao?: string | null
          emissor?: string | null
          id?: string | null
          is_primary?: boolean | null
          nome?: string | null
          numero_serie?: string | null
          tipo?: string | null
          titular?: string | null
          updated_at?: string | null
          uploaded_at?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_settings_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_contact_only: {
        Row: {
          address: string | null
          city: string | null
          created_at: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          nickname: string | null
          notes: string | null
          phone: string | null
          state: string | null
          trade_name: string | null
          updated_at: string | null
          whatsapp: string | null
          whatsapp_validated: boolean | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          trade_name?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          whatsapp_validated?: boolean | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          nickname?: string | null
          notes?: string | null
          phone?: string | null
          state?: string | null
          trade_name?: string | null
          updated_at?: string | null
          whatsapp?: string | null
          whatsapp_validated?: boolean | null
          zip_code?: string | null
        }
        Relationships: []
      }
      company_settings_safe: {
        Row: {
          business_hours: Json | null
          certificado_arquivo_url: string | null
          certificado_tipo: string | null
          certificado_uploaded_at: string | null
          certificado_validade: string | null
          cnpj: string | null
          created_at: string | null
          email: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_cidade: string | null
          endereco_codigo_ibge: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          endereco_uf: string | null
          id: string | null
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          nfse_aliquota_padrao: number | null
          nfse_ambiente: string | null
          nfse_cnae_padrao: string | null
          nfse_codigo_tributacao_padrao: string | null
          nfse_descricao_servico_padrao: string | null
          nfse_incentivador_cultural: boolean | null
          nfse_optante_simples: boolean | null
          nfse_regime_tributario: string | null
          nome_fantasia: string | null
          razao_social: string | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          business_hours?: Json | null
          certificado_arquivo_url?: string | null
          certificado_tipo?: string | null
          certificado_uploaded_at?: string | null
          certificado_validade?: string | null
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_codigo_ibge?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string | null
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          nfse_aliquota_padrao?: number | null
          nfse_ambiente?: string | null
          nfse_cnae_padrao?: string | null
          nfse_codigo_tributacao_padrao?: string | null
          nfse_descricao_servico_padrao?: string | null
          nfse_incentivador_cultural?: boolean | null
          nfse_optante_simples?: boolean | null
          nfse_regime_tributario?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          business_hours?: Json | null
          certificado_arquivo_url?: string | null
          certificado_tipo?: string | null
          certificado_uploaded_at?: string | null
          certificado_validade?: string | null
          cnpj?: string | null
          created_at?: string | null
          email?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_cidade?: string | null
          endereco_codigo_ibge?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string | null
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          nfse_aliquota_padrao?: number | null
          nfse_ambiente?: string | null
          nfse_cnae_padrao?: string | null
          nfse_codigo_tributacao_padrao?: string | null
          nfse_descricao_servico_padrao?: string | null
          nfse_incentivador_cultural?: boolean | null
          nfse_optante_simples?: boolean | null
          nfse_regime_tributario?: string | null
          nome_fantasia?: string | null
          razao_social?: string | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nfse_history_safe: {
        Row: {
          aliquota: number | null
          ambiente: string | null
          asaas_invoice_id: string | null
          asaas_payment_id: string | null
          asaas_status: string | null
          chave_acesso: string | null
          client_id: string | null
          cnae: string | null
          codigo_retorno: string | null
          codigo_tributacao: string | null
          codigo_verificacao_masked: string | null
          competencia: string | null
          contract_id: string | null
          created_at: string | null
          danfse_url: string | null
          data_autorizacao: string | null
          data_cancelamento: string | null
          data_emissao: string | null
          descricao_servico: string | null
          emitido_por: string | null
          id: string | null
          invoice_id: string | null
          mensagem_retorno: string | null
          motivo_cancelamento: string | null
          municipal_service_id: string | null
          nfse_substituta_id: string | null
          numero_lote: string | null
          numero_nfse: string | null
          pdf_url: string | null
          protocolo: string | null
          provider: string | null
          serie: string | null
          status: string | null
          updated_at: string | null
          valor_iss: number | null
          valor_servico: number | null
          xml_url: string | null
        }
        Insert: {
          aliquota?: number | null
          ambiente?: string | null
          asaas_invoice_id?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          chave_acesso?: string | null
          client_id?: string | null
          cnae?: string | null
          codigo_retorno?: string | null
          codigo_tributacao?: string | null
          codigo_verificacao_masked?: never
          competencia?: string | null
          contract_id?: string | null
          created_at?: string | null
          danfse_url?: string | null
          data_autorizacao?: string | null
          data_cancelamento?: string | null
          data_emissao?: string | null
          descricao_servico?: string | null
          emitido_por?: string | null
          id?: string | null
          invoice_id?: string | null
          mensagem_retorno?: string | null
          motivo_cancelamento?: string | null
          municipal_service_id?: string | null
          nfse_substituta_id?: string | null
          numero_lote?: string | null
          numero_nfse?: string | null
          pdf_url?: string | null
          protocolo?: string | null
          provider?: string | null
          serie?: string | null
          status?: string | null
          updated_at?: string | null
          valor_iss?: number | null
          valor_servico?: number | null
          xml_url?: string | null
        }
        Update: {
          aliquota?: number | null
          ambiente?: string | null
          asaas_invoice_id?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          chave_acesso?: string | null
          client_id?: string | null
          cnae?: string | null
          codigo_retorno?: string | null
          codigo_tributacao?: string | null
          codigo_verificacao_masked?: never
          competencia?: string | null
          contract_id?: string | null
          created_at?: string | null
          danfse_url?: string | null
          data_autorizacao?: string | null
          data_cancelamento?: string | null
          data_emissao?: string | null
          descricao_servico?: string | null
          emitido_por?: string | null
          id?: string | null
          invoice_id?: string | null
          mensagem_retorno?: string | null
          motivo_cancelamento?: string | null
          municipal_service_id?: string | null
          nfse_substituta_id?: string | null
          numero_lote?: string | null
          numero_nfse?: string | null
          pdf_url?: string | null
          protocolo?: string | null
          provider?: string | null
          serie?: string | null
          status?: string | null
          updated_at?: string | null
          valor_iss?: number | null
          valor_servico?: number | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfse_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_nfse_substituta_id_fkey"
            columns: ["nfse_substituta_id"]
            isOneToOne: false
            referencedRelation: "nfse_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nfse_history_nfse_substituta_id_fkey"
            columns: ["nfse_substituta_id"]
            isOneToOne: false
            referencedRelation: "nfse_history_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      software_licenses_safe: {
        Row: {
          client_id: string | null
          created_at: string | null
          expire_date: string | null
          id: string | null
          license_key_masked: string | null
          name: string | null
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          total_licenses: number | null
          updated_at: string | null
          used_licenses: number | null
          vendor: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          expire_date?: string | null
          id?: string | null
          license_key_masked?: never
          name?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          total_licenses?: number | null
          updated_at?: string | null
          used_licenses?: number | null
          vendor?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          expire_date?: string | null
          id?: string | null
          license_key_masked?: never
          name?: string | null
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          total_licenses?: number | null
          updated_at?: string | null
          used_licenses?: number | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "software_licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "software_licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_contact_only"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      auto_reconcile_bank_entries: { Args: never; Returns: Json }
      calculate_penalties: {
        Args: {
          p_amount: number
          p_due_date: string
          p_fine_pct?: number
          p_monthly_interest_pct?: number
        }
        Returns: {
          days_overdue: number
          fine: number
          interest: number
          total: number
        }[]
      }
      cleanup_old_application_logs: { Args: never; Returns: undefined }
      cleanup_old_monitoring_alerts: { Args: never; Returns: undefined }
      client_owns_record: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      generate_signed_url: {
        Args: { p_bucket: string; p_expires_in?: number; p_path: string }
        Returns: string
      }
      generate_slug: { Args: { title: string }; Returns: string }
      get_additional_charges_report: {
        Args: { end_date: string; start_date: string }
        Returns: Json
      }
      get_calendar_tokens: {
        Args: { user_uuid: string }
        Returns: {
          access_token: string
          refresh_token: string
        }[]
      }
      get_certificate_password: { Args: { cert_id: string }; Returns: string }
      get_client_management_report: {
        Args: { p_client_id: string; p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_company_certificate_password: { Args: never; Returns: string }
      get_contracts_invoice_summary: {
        Args: never
        Returns: {
          contract_id: string
          overdue_count: number
          overdue_total: number
          paid_count: number
          paid_total: number
          pending_count: number
          total_invoiced: number
        }[]
      }
      get_integration_health_stats: { Args: never; Returns: Json }
      get_invoice_report_stats: { Args: { start_date: string }; Returns: Json }
      get_license_key: { Args: { license_id: string }; Returns: string }
      get_technician_ranking: {
        Args: { limit_count?: number; start_date: string }
        Returns: Json
      }
      get_ticket_form_data: { Args: { p_client_id?: string }; Returns: Json }
      get_ticket_report_stats: { Args: { start_date: string }; Returns: Json }
      get_weekly_ticket_trend: {
        Args: never
        Returns: {
          day: string
          day_date: string
          resolved: number
          tickets: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_financial_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_technician_only: { Args: { _user_id: string }; Returns: boolean }
      try_bootstrap_admin: { Args: { _user_id: string }; Returns: boolean }
      update_invoice_status: {
        Args: {
          p_boleto_error?: string
          p_boleto_status?: Database["public"]["Enums"]["boleto_processing_status"]
          p_email_error?: string
          p_email_status?: Database["public"]["Enums"]["email_processing_status"]
          p_invoice_id: string
          p_nfse_error?: string
          p_nfse_status?: Database["public"]["Enums"]["nfse_processing_status"]
        }
        Returns: undefined
      }
      verify_tv_dashboard_token: {
        Args: { token_param: string }
        Returns: {
          access_token: string
          created_at: string
          id: string
          logo_url: string | null
          name: string
          rotation_interval: number
          show_metrics: boolean
          show_monitoring: boolean
          show_ranking: boolean
          show_tickets: boolean
          theme: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tv_dashboard_config"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      alert_level: "critical" | "warning" | "info"
      alert_status: "active" | "acknowledged" | "resolved"
      app_role:
        | "admin"
        | "manager"
        | "technician"
        | "financial"
        | "client"
        | "client_master"
      asset_status: "active" | "maintenance" | "disposed" | "loaned"
      asset_type:
        | "computer"
        | "notebook"
        | "server"
        | "printer"
        | "switch"
        | "router"
        | "software"
        | "license"
        | "other"
      boleto_processing_status: "pendente" | "gerado" | "enviado" | "erro"
      contract_status:
        | "active"
        | "expired"
        | "cancelled"
        | "pending"
        | "suspended"
      email_processing_status: "pendente" | "enviado" | "erro"
      event_type:
        | "visit"
        | "meeting"
        | "on_call"
        | "unavailable"
        | "personal"
        | "billing_reminder"
      incident_type_enum:
        | "nfse_failure"
        | "boleto_failure"
        | "send_failure"
        | "e0014"
      invoice_status:
        | "pending"
        | "paid"
        | "overdue"
        | "cancelled"
        | "lost"
        | "renegotiated"
      nfse_processing_status: "pendente" | "gerada" | "erro"
      support_model: "ticket" | "hours_bank" | "unlimited"
      technician_level: "bronze" | "silver" | "gold" | "platinum" | "diamond"
      ticket_origin: "portal" | "phone" | "email" | "chat" | "whatsapp"
      ticket_priority: "low" | "medium" | "high" | "critical"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting"
        | "resolved"
        | "closed"
        | "paused"
        | "waiting_third_party"
        | "no_contact"
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
      alert_level: ["critical", "warning", "info"],
      alert_status: ["active", "acknowledged", "resolved"],
      app_role: [
        "admin",
        "manager",
        "technician",
        "financial",
        "client",
        "client_master",
      ],
      asset_status: ["active", "maintenance", "disposed", "loaned"],
      asset_type: [
        "computer",
        "notebook",
        "server",
        "printer",
        "switch",
        "router",
        "software",
        "license",
        "other",
      ],
      boleto_processing_status: ["pendente", "gerado", "enviado", "erro"],
      contract_status: [
        "active",
        "expired",
        "cancelled",
        "pending",
        "suspended",
      ],
      email_processing_status: ["pendente", "enviado", "erro"],
      event_type: [
        "visit",
        "meeting",
        "on_call",
        "unavailable",
        "personal",
        "billing_reminder",
      ],
      incident_type_enum: [
        "nfse_failure",
        "boleto_failure",
        "send_failure",
        "e0014",
      ],
      invoice_status: [
        "pending",
        "paid",
        "overdue",
        "cancelled",
        "lost",
        "renegotiated",
      ],
      nfse_processing_status: ["pendente", "gerada", "erro"],
      support_model: ["ticket", "hours_bank", "unlimited"],
      technician_level: ["bronze", "silver", "gold", "platinum", "diamond"],
      ticket_origin: ["portal", "phone", "email", "chat", "whatsapp"],
      ticket_priority: ["low", "medium", "high", "critical"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting",
        "resolved",
        "closed",
        "paused",
        "waiting_third_party",
        "no_contact",
      ],
    },
  },
} as const
