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
      automation_logs: {
        Row: {
          action: string
          channel: string | null
          created_at: string
          detail: string | null
          id: string
          lead_id: string | null
          lead_name: string
          result: string
          user_id: string
        }
        Insert: {
          action: string
          channel?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string
          result?: string
          user_id: string
        }
        Update: {
          action?: string
          channel?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lead_id?: string | null
          lead_name?: string
          result?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          company?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          company?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_sends: {
        Row: {
          attempt_no: number
          body: string
          created_at: string
          error: string | null
          id: string
          kind: string
          lead_id: string | null
          lead_name: string
          provider: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          user_id: string
        }
        Insert: {
          attempt_no?: number
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          lead_name?: string
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email: string
          user_id: string
        }
        Update: {
          attempt_no?: number
          body?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          lead_id?: string | null
          lead_name?: string
          provider?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          created_at: string
          daily_cap: number
          follow_up_body: string
          follow_up_delay_days: number
          follow_up_subject: string
          from_email: string
          from_name: string
          initial_body: string
          initial_subject: string
          live_enabled: boolean
          max_follow_ups: number
          reply_to: string
          send_end_hour: number
          send_start_hour: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_cap?: number
          follow_up_body?: string
          follow_up_delay_days?: number
          follow_up_subject?: string
          from_email?: string
          from_name?: string
          initial_body?: string
          initial_subject?: string
          live_enabled?: boolean
          max_follow_ups?: number
          reply_to?: string
          send_end_hour?: number
          send_start_hour?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_cap?: number
          follow_up_body?: string
          follow_up_delay_days?: number
          follow_up_subject?: string
          from_email?: string
          from_name?: string
          initial_body?: string
          initial_subject?: string
          live_enabled?: boolean
          max_follow_ups?: number
          reply_to?: string
          send_end_hour?: number
          send_start_hour?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_suppressions: {
        Row: {
          created_at: string
          detail: string | null
          email: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email: string
          id?: string
          reason?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_paid: number
          balance: number
          client_address: string | null
          client_email: string | null
          client_id: string | null
          client_name: string
          created_at: string
          discount_percent: number
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json
          notes: string | null
          status: string
          subtotal: number
          tax_percent: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_paid?: number
          balance?: number
          client_address?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          discount_percent?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          tax_percent?: number
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          balance?: number
          client_address?: string | null
          client_email?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          discount_percent?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          status?: string
          subtotal?: number
          tax_percent?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_enrichment_cache: {
        Row: {
          accepted: boolean
          business_name: string
          cache_key: string
          created_at: string
          hits: number
          id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          accepted?: boolean
          business_name?: string
          cache_key: string
          created_at?: string
          hits?: number
          id?: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          accepted?: boolean
          business_name?: string
          cache_key?: string
          created_at?: string
          hits?: number
          id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      lead_gen_runs: {
        Row: {
          apify_dataset_id: string | null
          apify_run_id: string | null
          batch_count: number
          category: string
          completed_at: string | null
          crawl_limit: number
          created_at: string
          created_count: number
          error: string | null
          id: string
          location: string
          processed_keys: Json
          processing_started_at: string | null
          rejected_count: number
          requested: number
          skipped_duplicates: number
          source: string
          sourced_count: number
          stage_timings: Json
          status: string
          user_id: string
        }
        Insert: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          batch_count?: number
          category: string
          completed_at?: string | null
          crawl_limit?: number
          created_at?: string
          created_count?: number
          error?: string | null
          id?: string
          location: string
          processed_keys?: Json
          processing_started_at?: string | null
          rejected_count?: number
          requested?: number
          skipped_duplicates?: number
          source?: string
          sourced_count?: number
          stage_timings?: Json
          status?: string
          user_id: string
        }
        Update: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          batch_count?: number
          category?: string
          completed_at?: string | null
          crawl_limit?: number
          created_at?: string
          created_count?: number
          error?: string | null
          id?: string
          location?: string
          processed_keys?: Json
          processing_started_at?: string | null
          rejected_count?: number
          requested?: number
          skipped_duplicates?: number
          source?: string
          sourced_count?: number
          stage_timings?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          business_hours: string | null
          business_name: string
          category: string | null
          created_at: string
          date_added: string
          email: string | null
          id: string
          last_contacted_at: string | null
          lead_score: number | null
          location: string | null
          next_follow_up_at: string | null
          norm_domain: string | null
          norm_email: string | null
          norm_phone: string | null
          notes: string | null
          opted_out: boolean
          opted_out_at: string | null
          outreach_attempts: number
          outreach_channel: string | null
          outreach_status: string
          personalized_line: string | null
          phone: string | null
          queued_at: string | null
          reply_detected: boolean
          sequence_step: number
          sms_consent: boolean
          sms_consent_at: string | null
          sms_consent_source: string | null
          source: string
          status: string
          stop_outreach: boolean
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          business_hours?: string | null
          business_name: string
          category?: string | null
          created_at?: string
          date_added?: string
          email?: string | null
          id?: string
          last_contacted_at?: string | null
          lead_score?: number | null
          location?: string | null
          next_follow_up_at?: string | null
          norm_domain?: string | null
          norm_email?: string | null
          norm_phone?: string | null
          notes?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          outreach_attempts?: number
          outreach_channel?: string | null
          outreach_status?: string
          personalized_line?: string | null
          phone?: string | null
          queued_at?: string | null
          reply_detected?: boolean
          sequence_step?: number
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_source?: string | null
          source?: string
          status?: string
          stop_outreach?: boolean
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          business_hours?: string | null
          business_name?: string
          category?: string | null
          created_at?: string
          date_added?: string
          email?: string | null
          id?: string
          last_contacted_at?: string | null
          lead_score?: number | null
          location?: string | null
          next_follow_up_at?: string | null
          norm_domain?: string | null
          norm_email?: string | null
          norm_phone?: string | null
          notes?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          outreach_attempts?: number
          outreach_channel?: string | null
          outreach_status?: string
          personalized_line?: string | null
          phone?: string | null
          queued_at?: string | null
          reply_detected?: boolean
          sequence_step?: number
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_source?: string | null
          source?: string
          status?: string
          stop_outreach?: boolean
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      meetings: {
        Row: {
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string
          duration_minutes: number
          id: string
          lead_id: string | null
          location: string | null
          notes: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          lead_id?: string | null
          location?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          lead_id?: string | null
          location?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_suppressions: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          phone: string
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          phone: string
          reason?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          phone?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          email: string
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_team_member: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
