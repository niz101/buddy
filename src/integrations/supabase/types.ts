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
      customer_sessions: {
        Row: {
          created_at: string | null
          entry_time: string | null
          exit_time: string | null
          id: string
          preferred_language: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          entry_time?: string | null
          exit_time?: string | null
          id?: string
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          entry_time?: string | null
          exit_time?: string | null
          id?: string
          preferred_language?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          total_amount?: number | null
        }
        Relationships: []
      }
      daily_reports: {
        Row: {
          alerts_count: number | null
          created_at: string | null
          id: string
          items_sold: number | null
          low_stock_items: Json | null
          report_date: string
          total_customers: number | null
          total_orders: number | null
          total_revenue: number | null
        }
        Insert: {
          alerts_count?: number | null
          created_at?: string | null
          id?: string
          items_sold?: number | null
          low_stock_items?: Json | null
          report_date: string
          total_customers?: number | null
          total_orders?: number | null
          total_revenue?: number | null
        }
        Update: {
          alerts_count?: number | null
          created_at?: string | null
          id?: string
          items_sold?: number | null
          low_stock_items?: Json | null
          report_date?: string
          total_customers?: number | null
          total_orders?: number | null
          total_revenue?: number | null
        }
        Relationships: []
      }
      greetings: {
        Row: {
          farewell_text: string
          greeting_text: string
          id: string
          language_code: string
          order_confirm_text: string | null
          payment_prompt_text: string | null
          thank_you_text: string | null
        }
        Insert: {
          farewell_text: string
          greeting_text: string
          id?: string
          language_code: string
          order_confirm_text?: string | null
          payment_prompt_text?: string | null
          thank_you_text?: string | null
        }
        Update: {
          farewell_text?: string
          greeting_text?: string
          id?: string
          language_code?: string
          order_confirm_text?: string | null
          payment_prompt_text?: string | null
          thank_you_text?: string | null
        }
        Relationships: []
      }
      inventory_logs: {
        Row: {
          change_type: string
          created_at: string | null
          id: string
          new_quantity: number | null
          previous_quantity: number | null
          product_id: string | null
          quantity_change: number
          reason: string | null
        }
        Insert: {
          change_type: string
          created_at?: string | null
          id?: string
          new_quantity?: number | null
          previous_quantity?: number | null
          product_id?: string | null
          quantity_change: number
          reason?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string | null
          id?: string
          new_quantity?: number | null
          previous_quantity?: number | null
          product_id?: string | null
          quantity_change?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          packed: boolean | null
          product_id: string | null
          quantity: number
          substituted_product_id: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          packed?: boolean | null
          product_id?: string | null
          quantity?: number
          substituted_product_id?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          packed?: boolean | null
          product_id?: string | null
          quantity?: number
          substituted_product_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_substituted_product_id_fkey"
            columns: ["substituted_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          id: string
          packed_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_reference: string | null
          payment_verified: boolean | null
          robot_task_id: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          packed_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_verified?: boolean | null
          robot_task_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          packed_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_reference?: string | null
          payment_verified?: boolean | null
          robot_task_id?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          mpesa_checkout_request_id: string | null
          mpesa_receipt: string | null
          order_id: string | null
          phone_number: string | null
          status: string | null
          verified: boolean | null
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          mpesa_checkout_request_id?: string | null
          mpesa_receipt?: string | null
          order_id?: string | null
          phone_number?: string | null
          status?: string | null
          verified?: boolean | null
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          mpesa_checkout_request_id?: string | null
          mpesa_receipt?: string | null
          order_id?: string | null
          phone_number?: string | null
          status?: string | null
          verified?: boolean | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          card_code: string | null
          category: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          min_stock_threshold: number | null
          name: string
          name_swahili: string | null
          price: number
          shelf_location: string | null
          stock_quantity: number
          updated_at: string | null
        }
        Insert: {
          card_code?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock_threshold?: number | null
          name: string
          name_swahili?: string | null
          price: number
          shelf_location?: string | null
          stock_quantity?: number
          updated_at?: string | null
        }
        Update: {
          card_code?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          min_stock_threshold?: number | null
          name?: string
          name_swahili?: string | null
          price?: number
          shelf_location?: string | null
          stock_quantity?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      robot_tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          items_packed: Json | null
          items_picked: Json | null
          items_to_pick: Json | null
          order_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["robot_status"] | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_packed?: Json | null
          items_picked?: Json | null
          items_to_pick?: Json | null
          order_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["robot_status"] | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_packed?: Json | null
          items_picked?: Json | null
          items_to_pick?: Json | null
          order_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["robot_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "robot_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at: string | null
          details: Json | null
          id: string
          message: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          alert_type: Database["public"]["Enums"]["alert_type"]
          created_at?: string | null
          details?: Json | null
          id?: string
          message: string
          severity: Database["public"]["Enums"]["alert_severity"]
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          alert_type?: Database["public"]["Enums"]["alert_type"]
          created_at?: string | null
          details?: Json | null
          id?: string
          message?: string
          severity?: Database["public"]["Enums"]["alert_severity"]
        }
        Relationships: []
      }
      shop_status: {
        Row: {
          conveyor_active: boolean | null
          current_session_id: string | null
          door_locked: boolean | null
          emergency_mode: boolean | null
          fire_alarm: boolean | null
          id: string
          is_open: boolean | null
          last_heartbeat: string | null
          robot_status: Database["public"]["Enums"]["robot_status"] | null
          updated_at: string | null
        }
        Insert: {
          conveyor_active?: boolean | null
          current_session_id?: string | null
          door_locked?: boolean | null
          emergency_mode?: boolean | null
          fire_alarm?: boolean | null
          id?: string
          is_open?: boolean | null
          last_heartbeat?: string | null
          robot_status?: Database["public"]["Enums"]["robot_status"] | null
          updated_at?: string | null
        }
        Update: {
          conveyor_active?: boolean | null
          current_session_id?: string | null
          door_locked?: boolean | null
          emergency_mode?: boolean | null
          fire_alarm?: boolean | null
          id?: string
          is_open?: boolean | null
          last_heartbeat?: string | null
          robot_status?: Database["public"]["Enums"]["robot_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_status_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "customer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          message: string
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          message: string
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_stock: {
        Args: { p_product_id: string; p_quantity: number; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      alert_severity: "low" | "medium" | "high" | "critical"
      alert_type:
        | "security"
        | "fire"
        | "theft"
        | "tamper"
        | "inventory"
        | "system"
        | "payment"
      order_status:
        | "pending"
        | "processing"
        | "packing"
        | "payment_pending"
        | "paid"
        | "delivered"
        | "cancelled"
      payment_method: "mpesa" | "cash" | "card"
      robot_status:
        | "idle"
        | "picking"
        | "packing"
        | "delivering"
        | "error"
        | "maintenance"
      session_status: "active" | "completed" | "abandoned" | "emergency"
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
      alert_severity: ["low", "medium", "high", "critical"],
      alert_type: [
        "security",
        "fire",
        "theft",
        "tamper",
        "inventory",
        "system",
        "payment",
      ],
      order_status: [
        "pending",
        "processing",
        "packing",
        "payment_pending",
        "paid",
        "delivered",
        "cancelled",
      ],
      payment_method: ["mpesa", "cash", "card"],
      robot_status: [
        "idle",
        "picking",
        "packing",
        "delivering",
        "error",
        "maintenance",
      ],
      session_status: ["active", "completed", "abandoned", "emergency"],
    },
  },
} as const
