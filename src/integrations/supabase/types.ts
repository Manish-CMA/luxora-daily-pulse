export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      agents: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      daily_report_entries: {
        Row: {
          agent_id: string | null;
          agent_name: string;
          calls_made: number;
          calls_picked: number;
          created_at: string;
          direct_tc: number;
          id: string;
          pre_tc: number;
          pre_tc_to_tc: number;
          report_id: string;
        };
        Insert: {
          agent_id?: string | null;
          agent_name: string;
          calls_made?: number;
          calls_picked?: number;
          created_at?: string;
          direct_tc?: number;
          id?: string;
          pre_tc?: number;
          pre_tc_to_tc?: number;
          report_id: string;
        };
        Update: {
          agent_id?: string | null;
          agent_name?: string;
          calls_made?: number;
          calls_picked?: number;
          created_at?: string;
          direct_tc?: number;
          id?: string;
          pre_tc?: number;
          pre_tc_to_tc?: number;
          report_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_report_entries_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "daily_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_reports: {
        Row: {
          created_at: string;
          id: string;
          last_edited_at: string | null;
          last_edited_by: string | null;
          last_edited_by_name: string | null;
          report_date: string;
          status: string;
          submitted_at: string;
          submitted_by: string | null;
          submitted_by_name: string | null;
          tc_done: number;
          tc_scheduled: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_edited_at?: string | null;
          last_edited_by?: string | null;
          last_edited_by_name?: string | null;
          report_date: string;
          status?: string;
          submitted_at?: string;
          submitted_by?: string | null;
          submitted_by_name?: string | null;
          tc_done?: number;
          tc_scheduled?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_edited_at?: string | null;
          last_edited_by?: string | null;
          last_edited_by_name?: string | null;
          report_date?: string;
          status?: string;
          submitted_at?: string;
          submitted_by?: string | null;
          submitted_by_name?: string | null;
          tc_done?: number;
          tc_scheduled?: number;
        };
        Relationships: [];
      };
      tc_shift_snapshots: {
        Row: {
          aligned_data: Json;
          aligned_raw: string;
          created_at: string;
          id: string;
          imported_by: string | null;
          imported_by_name: string | null;
          phase: string;
          scheduled_data: Json;
          scheduled_raw: string;
          shift_date: string;
          updated_at: string;
        };
        Insert: {
          aligned_data?: Json;
          aligned_raw?: string;
          created_at?: string;
          id?: string;
          imported_by?: string | null;
          imported_by_name?: string | null;
          phase: string;
          scheduled_data?: Json;
          scheduled_raw?: string;
          shift_date: string;
          updated_at?: string;
        };
        Update: {
          aligned_data?: Json;
          aligned_raw?: string;
          created_at?: string;
          id?: string;
          imported_by?: string | null;
          imported_by_name?: string | null;
          phase?: string;
          scheduled_data?: Json;
          scheduled_raw?: string;
          shift_date?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tc_doctor_schedule: {
        Row: {
          created_at: string;
          schedule_data: Json;
          shift_date: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          schedule_data?: Json;
          shift_date: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          schedule_data?: Json;
          shift_date?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "manager" | "operations";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "operations"],
    },
  },
} as const;
