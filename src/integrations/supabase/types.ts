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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      answer_reports: {
        Row: {
          answer_id: string
          created_at: string
          reporter_id: string
        }
        Insert: {
          answer_id: string
          created_at?: string
          reporter_id: string
        }
        Update: {
          answer_id?: string
          created_at?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_reports_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "public_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          body: string
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          body: string
          created_at?: string
          email: string
          id?: string
          name: string
        }
        Update: {
          body?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string
          email_hash: string
          id: number
        }
        Insert: {
          created_at?: string
          email_hash: string
          id?: number
        }
        Update: {
          created_at?: string
          email_hash?: string
          id?: number
        }
        Relationships: []
      }
      message_moderation: {
        Row: {
          category: string | null
          created_at: string
          message_id: string
          reason: string | null
          source: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          message_id: string
          reason?: string | null
          source: string
        }
        Update: {
          category?: string | null
          created_at?: string
          message_id?: string
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_moderation_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_replies: {
        Row: {
          author: string
          body: string
          created_at: string
          id: string
          message_id: string
          reason: string | null
          status: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          id?: string
          message_id: string
          reason?: string | null
          status?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          id?: string
          message_id?: string
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          created_at: string
          message_id: string
          reporter_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          reporter_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_senders: {
        Row: {
          created_at: string
          message_id: string
          sender_network_hash: string | null
          sender_user_id: string | null
        }
        Insert: {
          created_at?: string
          message_id: string
          sender_network_hash?: string | null
          sender_user_id?: string | null
        }
        Update: {
          created_at?: string
          message_id?: string
          sender_network_hash?: string | null
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_senders_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_senders_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_trackers: {
        Row: {
          created_at: string
          final_state: string | null
          message_id: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          final_state?: string | null
          message_id?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          final_state?: string | null
          message_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_trackers_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          hidden: boolean
          id: string
          read_at: string | null
          recipient_id: string
          replies_closed: boolean
          report_count: number
          reviewed: boolean
          status: string
        }
        Insert: {
          body: string
          created_at?: string
          hidden?: boolean
          id?: string
          read_at?: string | null
          recipient_id: string
          replies_closed?: boolean
          report_count?: number
          reviewed?: boolean
          status?: string
        }
        Update: {
          body?: string
          created_at?: string
          hidden?: boolean
          id?: string
          read_at?: string | null
          recipient_id?: string
          replies_closed?: boolean
          report_count?: number
          reviewed?: boolean
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          inbox_paused: boolean
          searchable: boolean
          suspended: boolean
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          inbox_paused?: boolean
          searchable?: boolean
          suspended?: boolean
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          inbox_paused?: boolean
          searchable?: boolean
          suspended?: boolean
          username?: string | null
        }
        Relationships: []
      }
      public_answers: {
        Row: {
          answer: string
          created_at: string
          hidden: boolean
          id: string
          owner_id: string
          question: string
          reason: string | null
          report_count: number
          status: string
        }
        Insert: {
          answer: string
          created_at?: string
          hidden?: boolean
          id?: string
          owner_id: string
          question: string
          reason?: string | null
          report_count?: number
          status?: string
        }
        Update: {
          answer?: string
          created_at?: string
          hidden?: boolean
          id?: string
          owner_id?: string
          question?: string
          reason?: string | null
          report_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_answers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_events: {
        Row: {
          anonymous: boolean
          created_at: string
          id: number
          ip_hash: string
          recipient_id: string
        }
        Insert: {
          anonymous?: boolean
          created_at?: string
          id?: number
          ip_hash: string
          recipient_id: string
        }
        Update: {
          anonymous?: boolean
          created_at?: string
          id?: number
          ip_hash?: string
          recipient_id?: string
        }
        Relationships: []
      }
      search_events: {
        Row: {
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      add_owner_reply: {
        Args: {
          _body: string
          _message_id: string
          _owner: string
          _reason: string
          _status: string
        }
        Returns: string
      }
      add_sender_reply: {
        Args: {
          _body: string
          _reason: string
          _status: string
          _token_hash: string
        }
        Returns: string
      }
      admin_decide_answer: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      admin_decide_message: {
        Args: { _approve: boolean; _message_id: string }
        Returns: undefined
      }
      admin_decide_reply: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      admin_list_users: {
        Args: { _search: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          id: string
          suspended: boolean
          username: string
        }[]
      }
      admin_message_details: {
        Args: { _message_ids: string[] }
        Returns: {
          message_id: string
          recipient_display_name: string
          recipient_username: string
          sender_email: string
          sender_kind: string
          sender_network_code: string
          sender_other_messages: number
          sender_username: string
        }[]
      }
      admin_review_message: {
        Args: { _message_id: string; _restore: boolean }
        Returns: undefined
      }
      admin_review_queue: {
        Args: never
        Returns: {
          body: string
          context: string
          created_at: string
          id: string
          kind: string
          reason: string
          reports: number
        }[]
      }
      admin_set_suspended: {
        Args: { _suspended: boolean; _user_id: string }
        Returns: undefined
      }
      admin_stats: { Args: never; Returns: Json }
      attach_message_tracker: {
        Args: { _message_id: string; _token_hash: string }
        Returns: undefined
      }
      get_public_answers: {
        Args: { _username: string }
        Returns: {
          answer: string
          created_at: string
          id: string
          question: string
        }[]
      }
      get_public_profile: {
        Args: { _username: string }
        Returns: {
          accepting: boolean
          display_name: string
          username: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_allowed_email: { Args: { _email: string }; Returns: boolean }
      is_username_available: { Args: { _username: string }; Returns: boolean }
      message_retention_days: { Args: never; Returns: number }
      message_status: {
        Args: { _token: string }
        Returns: {
          body: string
          sent_at: string
          state: string
        }[]
      }
      message_thread: {
        Args: { _token: string }
        Returns: {
          author: string
          body: string
          can_reply: boolean
          closed: boolean
          created_at: string
          id: string
          status: string
        }[]
      }
      publish_answer: {
        Args: {
          _answer: string
          _message_id: string
          _owner: string
          _reason: string
          _status: string
        }
        Returns: string
      }
      purge_expired: { Args: never; Returns: undefined }
      report_answer: { Args: { _answer_id: string }; Returns: undefined }
      report_message: { Args: { _message_id: string }; Returns: undefined }
      search_profiles: {
        Args: { _query: string }
        Returns: {
          accepting: boolean
          display_name: string
          username: string
        }[]
      }
      set_thread_closed: {
        Args: { _closed: boolean; _message_id: string }
        Returns: undefined
      }
      store_screened_message: {
        Args: {
          _anonymous: boolean
          _body: string
          _category: string
          _rate_hash: string
          _reason: string
          _recipient_id: string
          _sender_network_hash: string
          _sender_user_id: string
          _source: string
          _status: string
        }
        Returns: string
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
