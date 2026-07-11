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
      attendances: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          joined_at: string | null
          last_seen_at: string | null
          left_at: string | null
          notes: string | null
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          total_seconds_present: number
          updated_at: string
          verification_method: Database["public"]["Enums"]["verification_method"]
          verified_by: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          joined_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          notes?: string | null
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          total_seconds_present?: number
          updated_at?: string
          verification_method?: Database["public"]["Enums"]["verification_method"]
          verified_by?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          joined_at?: string | null
          last_seen_at?: string | null
          left_at?: string | null
          notes?: string | null
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          total_seconds_present?: number
          updated_at?: string
          verification_method?: Database["public"]["Enums"]["verification_method"]
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      class_enrollments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_teachers: {
        Row: {
          class_id: string
          created_at: string
          id: string
          subject: string | null
          teacher_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          subject?: string | null
          teacher_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          subject?: string | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          level: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          level?: string | null
          name?: string
        }
        Relationships: []
      }
      face_check_results: {
        Row: {
          created_at: string
          error: string | null
          id: string
          present: boolean
          round_id: string
          similarity: number | null
          student_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          present?: boolean
          round_id: string
          similarity?: number | null
          student_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          present?: boolean
          round_id?: string
          similarity?: number | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_check_results_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "face_check_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      face_check_rounds: {
        Row: {
          ended_at: string | null
          id: string
          label: string | null
          session_id: string
          started_at: string
          started_by: string
          threshold: number | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          label?: string | null
          session_id: string
          started_at?: string
          started_by: string
          threshold?: number | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          label?: string | null
          session_id?: string
          started_at?: string
          started_by?: string
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "face_check_rounds_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      face_profiles: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          indexed_at: string | null
          rekognition_external_id: string | null
          rekognition_face_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          indexed_at?: string | null
          rekognition_external_id?: string | null
          rekognition_face_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          indexed_at?: string | null
          rekognition_external_id?: string | null
          rekognition_face_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          message: string
          read_at: string | null
          recipient_id: string
          session_id: string | null
          student_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          message: string
          read_at?: string | null
          recipient_id: string
          session_id?: string | null
          student_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          message?: string
          read_at?: string | null
          recipient_id?: string
          session_id?: string | null
          student_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_links: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          relationship: string | null
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          relationship?: string | null
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          relationship?: string | null
          student_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          student_number: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          student_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          actual_end: string | null
          actual_start: string | null
          class_id: string
          created_at: string
          description: string | null
          face_similarity_threshold: number
          id: string
          scheduled_end: string
          scheduled_start: string
          status: Database["public"]["Enums"]["session_status"]
          teacher_id: string
          title: string
          zoom_join_url: string | null
          zoom_meeting_id: string | null
          zoom_password: string | null
          zoom_start_url: string | null
        }
        Insert: {
          actual_end?: string | null
          actual_start?: string | null
          class_id: string
          created_at?: string
          description?: string | null
          face_similarity_threshold?: number
          id?: string
          scheduled_end: string
          scheduled_start: string
          status?: Database["public"]["Enums"]["session_status"]
          teacher_id: string
          title: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_password?: string | null
          zoom_start_url?: string | null
        }
        Update: {
          actual_end?: string | null
          actual_start?: string | null
          class_id?: string
          created_at?: string
          description?: string | null
          face_similarity_threshold?: number
          id?: string
          scheduled_end?: string
          scheduled_start?: string
          status?: Database["public"]["Enums"]["session_status"]
          teacher_id?: string
          title?: string
          zoom_join_url?: string | null
          zoom_meeting_id?: string | null
          zoom_password?: string | null
          zoom_start_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
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
      zoom_access_logs: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          ip: string | null
          reason: string
          session_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          allowed: boolean
          created_at?: string
          id?: string
          ip?: string | null
          reason: string
          session_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          ip?: string | null
          reason?: string
          session_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoom_access_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_enrollable_students: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "teacher" | "student" | "parent"
      attendance_status: "present" | "partial" | "absent" | "pending"
      notification_kind:
        | "attendance_present"
        | "attendance_partial"
        | "attendance_absent"
        | "session_starting"
        | "manual_correction"
      session_status: "scheduled" | "live" | "ended" | "cancelled"
      verification_method: "facial_recognition" | "manual" | "pending"
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
      app_role: ["admin", "teacher", "student", "parent"],
      attendance_status: ["present", "partial", "absent", "pending"],
      notification_kind: [
        "attendance_present",
        "attendance_partial",
        "attendance_absent",
        "session_starting",
        "manual_correction",
      ],
      session_status: ["scheduled", "live", "ended", "cancelled"],
      verification_method: ["facial_recognition", "manual", "pending"],
    },
  },
} as const
