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
      lead_gen_runs: {
        Row: {
          category: string
          created_at: string
          created_count: number
          error: string | null
          id: string
          location: string
          rejected_count: number
          requested: number
          skipped_duplicates: number
          source: string
          status: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          created_count?: number
          error?: string | null
          id?: string
          location: string
          rejected_count?: number
          requested?: number
          skipped_duplicates?: number
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          created_count?: number
          error?: string | null
          id?: string
          location?: string
          rejected_count?: number
          requested?: number
          skipped_duplicates?: number
          source?: string
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
          lead_score: number | null
          location: string | null
          notes: string | null
          outreach_channel: string | null
          personalized_line: string | null
          phone: string | null
          source: string
          status: string
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
          lead_score?: number | null
          location?: string | null
          notes?: string | null
          outreach_channel?: string | null
          personalized_line?: string | null
          phone?: string | null
          source?: string
          status?: string
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
          lead_score?: number | null
          location?: string | null
          notes?: string | null
          outreach_channel?: string | null
          personalized_line?: string | null
          phone?: string | null
          source?: string
          status?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
