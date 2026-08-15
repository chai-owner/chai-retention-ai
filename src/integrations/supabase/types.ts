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
      accounting_connections: {
        Row: {
          access_token: string
          account_id: string | null
          company_name: string | null
          connected_at: string
          expires_at: string | null
          id: string
          last_synced_at: string | null
          provider: string
          realm_id: string | null
          refresh_token: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_id?: string | null
          company_name?: string | null
          connected_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider: string
          realm_id?: string | null
          refresh_token?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_id?: string | null
          company_name?: string | null
          connected_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          realm_id?: string | null
          refresh_token?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      accounting_oauth_states: {
        Row: {
          created_at: string
          provider: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          provider: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          provider?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          id: string
          input_tokens: number
          model: string
          operation: string
          output_tokens: number
          total_tokens: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          operation: string
          output_tokens?: number
          total_tokens?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          operation?: string
          output_tokens?: number
          total_tokens?: number
          user_id?: string
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          metadata: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          metadata?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      crm_sync_state: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_id_aliases: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          source: string
          source_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          source?: string
          source_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          source?: string
          source_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      demo_leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          name: string
          website: string | null
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          name: string
          website?: string | null
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          website?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      freshdesk_connections: {
        Row: {
          api_key_ciphertext: string
          connected_at: string
          created_at: string
          domain: string
          id: string
          last_synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_ciphertext: string
          connected_at?: string
          created_at?: string
          domain: string
          id?: string
          last_synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_ciphertext?: string
          connected_at?: string
          created_at?: string
          domain?: string
          id?: string
          last_synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      impersonation_audit: {
        Row: {
          admin_id: string
          ended_at: string | null
          id: string
          started_at: string
          target_id: string
        }
        Insert: {
          admin_id: string
          ended_at?: string | null
          id?: string
          started_at?: string
          target_id: string
        }
        Update: {
          admin_id?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          target_id?: string
        }
        Relationships: []
      }
      ingest_batches: {
        Row: {
          created_at: string
          dataset_key: string
          error: string | null
          filename: string | null
          id: string
          meta: Json
          row_count: number
          source_kind: string
          source_provider: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dataset_key: string
          error?: string | null
          filename?: string | null
          id?: string
          meta?: Json
          row_count?: number
          source_kind: string
          source_provider: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dataset_key?: string
          error?: string | null
          filename?: string | null
          id?: string
          meta?: Json
          row_count?: number
          source_kind?: string
          source_provider?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      ingested_customers: {
        Row: {
          batch_id: string | null
          created_at: string
          customer_id: string
          data: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          customer_id: string
          data?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string
          data?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingested_customers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ingest_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_support: {
        Row: {
          batch_id: string | null
          created_at: string
          customer_id: string | null
          data: Json
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingested_support_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ingest_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_surveys: {
        Row: {
          batch_id: string | null
          created_at: string
          customer_id: string | null
          data: Json
          id: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingested_surveys_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ingest_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_transactions: {
        Row: {
          amount: number | null
          batch_id: string | null
          created_at: string
          customer_id: string | null
          data: Json
          id: string
          occurred_at: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          occurred_at?: string | null
          transaction_id: string
          user_id: string
        }
        Update: {
          amount?: number | null
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          occurred_at?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingested_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ingest_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_usage: {
        Row: {
          batch_id: string | null
          created_at: string
          customer_id: string | null
          data: Json
          id: string
          occurred_at: string | null
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          occurred_at?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          customer_id?: string | null
          data?: Json
          id?: string
          occurred_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingested_usage_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ingest_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      intercom_connections: {
        Row: {
          access_token: string
          app_id: string | null
          connected_at: string
          created_at: string
          id: string
          last_synced_at: string | null
          scope: string | null
          updated_at: string
          user_id: string
          workspace_id: string | null
          workspace_name: string | null
        }
        Insert: {
          access_token: string
          app_id?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Update: {
          access_token?: string
          app_id?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          scope?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
          workspace_name?: string | null
        }
        Relationships: []
      }
      intercom_oauth_states: {
        Row: {
          created_at: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avg_value: string
          booked_at: string | null
          cadence: string
          channels: Json
          churn_definition: string
          company: string
          concerns: string
          created_at: string
          customers: string
          disengagement: string
          email: string
          full_name: string
          id: string
          industry: string
          lifespan: string
          metric_weights: Json | null
          metrics: Json
          model: string
          must_track: string
          onboarded: boolean
          segments: Json
          size: string
          success_actions: string
          tracked: Json
          unlocked: boolean
          updated_at: string
          what_buy: string
        }
        Insert: {
          avg_value?: string
          booked_at?: string | null
          cadence?: string
          channels?: Json
          churn_definition?: string
          company?: string
          concerns?: string
          created_at?: string
          customers?: string
          disengagement?: string
          email?: string
          full_name?: string
          id: string
          industry?: string
          lifespan?: string
          metric_weights?: Json | null
          metrics?: Json
          model?: string
          must_track?: string
          onboarded?: boolean
          segments?: Json
          size?: string
          success_actions?: string
          tracked?: Json
          unlocked?: boolean
          updated_at?: string
          what_buy?: string
        }
        Update: {
          avg_value?: string
          booked_at?: string | null
          cadence?: string
          channels?: Json
          churn_definition?: string
          company?: string
          concerns?: string
          created_at?: string
          customers?: string
          disengagement?: string
          email?: string
          full_name?: string
          id?: string
          industry?: string
          lifespan?: string
          metric_weights?: Json | null
          metrics?: Json
          model?: string
          must_track?: string
          onboarded?: boolean
          segments?: Json
          size?: string
          success_actions?: string
          tracked?: Json
          unlocked?: boolean
          updated_at?: string
          what_buy?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          billing_interval: string
          cancelled_at: string | null
          created_at: string
          currency: string | null
          current_period_end: string | null
          id: string
          payer_email: string | null
          plan_id: string | null
          provider: string
          provider_subscription_id: string
          raw: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          billing_interval?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          payer_email?: string | null
          plan_id?: string | null
          provider?: string
          provider_subscription_id: string
          raw?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          billing_interval?: string
          cancelled_at?: string | null
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          id?: string
          payer_email?: string | null
          plan_id?: string | null
          provider?: string
          provider_subscription_id?: string
          raw?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_sync_state: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
      waitlist: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          name: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      zendesk_connections: {
        Row: {
          access_token: string
          connected_at: string
          created_at: string
          expires_at: string | null
          id: string
          last_synced_at: string | null
          org_name: string | null
          refresh_token: string | null
          scope: string | null
          subdomain: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          org_name?: string | null
          refresh_token?: string | null
          scope?: string | null
          subdomain: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          org_name?: string | null
          refresh_token?: string | null
          scope?: string | null
          subdomain?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zendesk_oauth_states: {
        Row: {
          created_at: string
          redirect_uri: string
          state: string
          subdomain: string
          user_id: string
        }
        Insert: {
          created_at?: string
          redirect_uri: string
          state: string
          subdomain: string
          user_id: string
        }
        Update: {
          created_at?: string
          redirect_uri?: string
          state?: string
          subdomain?: string
          user_id?: string
        }
        Relationships: []
      }
      zoho_crm_connections: {
        Row: {
          access_token: string
          api_domain: string
          connected_at: string
          dc: string
          expires_at: string | null
          id: string
          last_synced_at: string | null
          org_name: string | null
          refresh_token: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          api_domain: string
          connected_at?: string
          dc: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          org_name?: string | null
          refresh_token?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          api_domain?: string
          connected_at?: string
          dc?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          org_name?: string | null
          refresh_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      zoho_crm_oauth_states: {
        Row: {
          created_at: string
          dc: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dc: string
          redirect_uri: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          dc?: string
          redirect_uri?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
