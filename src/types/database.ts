/**
 * Amryn™ AIGrowthIntelligence® — database types.
 *
 * GENERATED FILE. Do not edit by hand.
 * Regenerate with: node scripts/generate-db-types.mjs > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Enums {
  alert_status: 'new' | 'acknowledged' | 'assigned' | 'snoozed' | 'dismissed' | 'resolved';
  connection_status: 'pending' | 'connected' | 'syncing' | 'error' | 'disabled';
  data_request_kind: 'export' | 'deletion' | 'correction';
  data_request_status: 'received' | 'in_progress' | 'completed' | 'refused';
  data_source_category: 'accounting' | 'crm' | 'pos' | 'erp' | 'spreadsheet' | 'database' | 'api' | 'manual';
  event_kind: 'anomaly' | 'trend' | 'threshold' | 'milestone' | 'ingestion' | 'manual';
  goal_status: 'draft' | 'active' | 'at_risk' | 'achieved' | 'missed' | 'cancelled';
  health_category: 'financial' | 'operational' | 'sales' | 'growth' | 'customer' | 'strategic';
  import_status: 'uploaded' | 'mapping' | 'validating' | 'ready' | 'importing' | 'complete' | 'failed';
  market_sector: 'private' | 'public' | 'mixed' | 'unknown';
  member_status: 'invited' | 'active' | 'suspended';
  metric_kind: 'financial' | 'sales' | 'operational' | 'customer' | 'employee' | 'growth' | 'custom';
  opportunity_kind: 'market_expansion' | 'partnership' | 'supplier' | 'distribution' | 'customer_acquisition' | 'product' | 'competitive_gap' | 'investment' | 'tender';
  opportunity_stage: 'discovered' | 'analysing' | 'qualified' | 'assigned' | 'in_progress' | 'won' | 'lost' | 'archived';
  org_role: 'super_admin' | 'org_admin' | 'executive' | 'regional_manager' | 'branch_manager' | 'department_manager' | 'analyst' | 'viewer';
  priority_level: 'critical' | 'high' | 'medium' | 'low';
  recommendation_status: 'new' | 'accepted' | 'in_progress' | 'done' | 'dismissed';
  risk_status: 'open' | 'mitigating' | 'monitoring' | 'closed' | 'accepted';
  scope_kind: 'organisation' | 'region' | 'branch' | 'department';
  signal_kind: 'market' | 'industry' | 'competitor' | 'company_news' | 'demand' | 'trend' | 'risk';
  subscription_plan: 'starter' | 'growth' | 'professional' | 'enterprise';
  subscription_status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  trend_direction: 'up' | 'down' | 'flat';
}

export interface Database {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          id: string;
          organisation_id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          user_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_conversations_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_conversations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_messages: {
        Row: {
          id: string;
          organisation_id: string;
          conversation_id: string;
          role: string;
          content: string;
          citations: Json;
          visualisations: Json;
          suggested_actions: Json;
          tokens_used: number | null;
          model: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          conversation_id: string;
          role: string;
          content: string;
          citations?: Json;
          visualisations?: Json;
          suggested_actions?: Json;
          tokens_used?: number | null;
          model?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          conversation_id?: string;
          role?: string;
          content?: string;
          citations?: Json;
          visualisations?: Json;
          suggested_actions?: Json;
          tokens_used?: number | null;
          model?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'ai_conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_messages_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_recommendations: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          title: string;
          summary: string;
          why_it_matters: string;
          recommended_action: string;
          evidence: Json;
          impact_cents: number | null;
          impact_note: string | null;
          confidence: number;
          priority: Enums['priority_level'];
          status: Enums['recommendation_status'];
          insight_ids: string[];
          signal_ids: string[];
          opportunity_id: string | null;
          generated_by: string;
          owner_id: string | null;
          created_at: string;
          updated_at: string;
          expires_on: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          title: string;
          summary: string;
          why_it_matters: string;
          recommended_action: string;
          evidence?: Json;
          impact_cents?: number | null;
          impact_note?: string | null;
          confidence?: number;
          priority?: Enums['priority_level'];
          status?: Enums['recommendation_status'];
          insight_ids?: string[];
          signal_ids?: string[];
          opportunity_id?: string | null;
          generated_by?: string;
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_on?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          title?: string;
          summary?: string;
          why_it_matters?: string;
          recommended_action?: string;
          evidence?: Json;
          impact_cents?: number | null;
          impact_note?: string | null;
          confidence?: number;
          priority?: Enums['priority_level'];
          status?: Enums['recommendation_status'];
          insight_ids?: string[];
          signal_ids?: string[];
          opportunity_id?: string | null;
          generated_by?: string;
          owner_id?: string | null;
          created_at?: string;
          updated_at?: string;
          expires_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_recommendations_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_recommendations_opportunity_id_fkey';
            columns: ['opportunity_id'];
            isOneToOne: false;
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_recommendations_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_recommendations_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      alerts: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          department_id: string | null;
          severity: Enums['priority_level'];
          status: Enums['alert_status'];
          title: string;
          detail: string | null;
          source_kind: string;
          business_event_id: string | null;
          risk_id: string | null;
          opportunity_id: string | null;
          assignee_id: string | null;
          snoozed_until: string | null;
          acknowledged_at: string | null;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          severity?: Enums['priority_level'];
          status?: Enums['alert_status'];
          title: string;
          detail?: string | null;
          source_kind?: string;
          business_event_id?: string | null;
          risk_id?: string | null;
          opportunity_id?: string | null;
          assignee_id?: string | null;
          snoozed_until?: string | null;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          severity?: Enums['priority_level'];
          status?: Enums['alert_status'];
          title?: string;
          detail?: string | null;
          source_kind?: string;
          business_event_id?: string | null;
          risk_id?: string | null;
          opportunity_id?: string | null;
          assignee_id?: string | null;
          snoozed_until?: string | null;
          acknowledged_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'alerts_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_business_event_id_fkey';
            columns: ['business_event_id'];
            isOneToOne: false;
            referencedRelation: 'business_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_opportunity_id_fkey';
            columns: ['opportunity_id'];
            isOneToOne: false;
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'alerts_risk_id_fkey';
            columns: ['risk_id'];
            isOneToOne: false;
            referencedRelation: 'risks';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          organisation_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          summary: string | null;
          metadata: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          organisation_id?: string | null;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          summary?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          organisation_id?: string | null;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          summary?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_logs_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      billing_records: {
        Row: {
          id: string;
          organisation_id: string;
          description: string;
          amount_cents: number;
          currency_code: string;
          status: string;
          issued_on: string;
          paid_at: string | null;
          external_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          description: string;
          amount_cents: number;
          currency_code?: string;
          status?: string;
          issued_on?: string;
          paid_at?: string | null;
          external_ref?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          description?: string;
          amount_cents?: number;
          currency_code?: string;
          status?: string;
          issued_on?: string;
          paid_at?: string | null;
          external_ref?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'billing_records_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      branches: {
        Row: {
          id: string;
          organisation_id: string;
          region_id: string | null;
          name: string;
          code: string | null;
          city: string | null;
          opened_on: string | null;
          headcount: number | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          region_id?: string | null;
          name: string;
          code?: string | null;
          city?: string | null;
          opened_on?: string | null;
          headcount?: number | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          region_id?: string | null;
          name?: string;
          code?: string | null;
          city?: string | null;
          opened_on?: string | null;
          headcount?: number | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'branches_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'branches_region_id_fkey';
            columns: ['region_id'];
            isOneToOne: false;
            referencedRelation: 'regions';
            referencedColumns: ['id'];
          },
        ];
      };
      business_events: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          department_id: string | null;
          metric_id: string | null;
          kind: Enums['event_kind'];
          severity: Enums['priority_level'];
          title: string;
          detail: string | null;
          evidence: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          metric_id?: string | null;
          kind: Enums['event_kind'];
          severity?: Enums['priority_level'];
          title: string;
          detail?: string | null;
          evidence?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          metric_id?: string | null;
          kind?: Enums['event_kind'];
          severity?: Enums['priority_level'];
          title?: string;
          detail?: string | null;
          evidence?: Json;
          occurred_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_events_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_events_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_events_metric_id_fkey';
            columns: ['metric_id'];
            isOneToOne: false;
            referencedRelation: 'business_metrics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_events_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      business_health_scores: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          score: number;
          classification: string;
          category_scores: Json;
          weights: Json;
          contributing_metrics: Json;
          calculated_for: string;
          calculated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          score: number;
          classification: string;
          category_scores?: Json;
          weights?: Json;
          contributing_metrics?: Json;
          calculated_for: string;
          calculated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          score?: number;
          classification?: string;
          category_scores?: Json;
          weights?: Json;
          contributing_metrics?: Json;
          calculated_for?: string;
          calculated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_health_scores_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_health_scores_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      business_insights: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          headline: string;
          narrative: string;
          category: Enums['health_category'] | null;
          direction: Enums['trend_direction'];
          impact_cents: number | null;
          confidence: number;
          evidence: Json;
          source_event_ids: string[];
          generated_by: string;
          valid_from: string;
          valid_to: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          headline: string;
          narrative: string;
          category?: Enums['health_category'] | null;
          direction?: Enums['trend_direction'];
          impact_cents?: number | null;
          confidence?: number;
          evidence?: Json;
          source_event_ids?: string[];
          generated_by?: string;
          valid_from?: string;
          valid_to?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          headline?: string;
          narrative?: string;
          category?: Enums['health_category'] | null;
          direction?: Enums['trend_direction'];
          impact_cents?: number | null;
          confidence?: number;
          evidence?: Json;
          source_event_ids?: string[];
          generated_by?: string;
          valid_from?: string;
          valid_to?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_insights_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'business_insights_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      business_metrics: {
        Row: {
          id: string;
          organisation_id: string;
          key: string;
          label: string;
          kind: Enums['metric_kind'];
          unit: string;
          higher_is_better: boolean;
          target_value: number | null;
          health_category: Enums['health_category'] | null;
          health_weight: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          key: string;
          label: string;
          kind: Enums['metric_kind'];
          unit?: string;
          higher_is_better?: boolean;
          target_value?: number | null;
          health_category?: Enums['health_category'] | null;
          health_weight?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          key?: string;
          label?: string;
          kind?: Enums['metric_kind'];
          unit?: string;
          higher_is_better?: boolean;
          target_value?: number | null;
          health_category?: Enums['health_category'] | null;
          health_weight?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'business_metrics_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      competitor_events: {
        Row: {
          id: string;
          organisation_id: string;
          competitor_id: string;
          kind: string;
          title: string;
          detail: string | null;
          impact: Enums['priority_level'];
          source_url: string | null;
          observed_on: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          competitor_id: string;
          kind: string;
          title: string;
          detail?: string | null;
          impact?: Enums['priority_level'];
          source_url?: string | null;
          observed_on?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          competitor_id?: string;
          kind?: string;
          title?: string;
          detail?: string | null;
          impact?: Enums['priority_level'];
          source_url?: string | null;
          observed_on?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'competitor_events_competitor_id_fkey';
            columns: ['competitor_id'];
            isOneToOne: false;
            referencedRelation: 'competitors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'competitor_events_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      competitors: {
        Row: {
          id: string;
          organisation_id: string;
          name: string;
          website: string | null;
          description: string | null;
          markets: string[];
          threat_level: Enums['priority_level'];
          is_tracked: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          website?: string | null;
          description?: string | null;
          markets?: string[];
          threat_level?: Enums['priority_level'];
          is_tracked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          name?: string;
          website?: string | null;
          description?: string | null;
          markets?: string[];
          threat_level?: Enums['priority_level'];
          is_tracked?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'competitors_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      data_connections: {
        Row: {
          id: string;
          organisation_id: string;
          data_source_id: string;
          status: Enums['connection_status'];
          config: Json;
          credential_ref: string | null;
          sync_schedule: string;
          field_mapping: Json;
          last_synced_at: string | null;
          last_error: string | null;
          consecutive_errors: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          data_source_id: string;
          status?: Enums['connection_status'];
          config?: Json;
          credential_ref?: string | null;
          sync_schedule?: string;
          field_mapping?: Json;
          last_synced_at?: string | null;
          last_error?: string | null;
          consecutive_errors?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          data_source_id?: string;
          status?: Enums['connection_status'];
          config?: Json;
          credential_ref?: string | null;
          sync_schedule?: string;
          field_mapping?: Json;
          last_synced_at?: string | null;
          last_error?: string | null;
          consecutive_errors?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'data_connections_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_connections_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      data_health_checks: {
        Row: {
          id: string;
          organisation_id: string;
          data_source_id: string;
          completeness_score: number;
          freshness_hours: number | null;
          error_count: number;
          missing_fields: string[];
          checked_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          data_source_id: string;
          completeness_score: number;
          freshness_hours?: number | null;
          error_count?: number;
          missing_fields?: string[];
          checked_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          data_source_id?: string;
          completeness_score?: number;
          freshness_hours?: number | null;
          error_count?: number;
          missing_fields?: string[];
          checked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'data_health_checks_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_health_checks_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      data_imports: {
        Row: {
          id: string;
          organisation_id: string;
          data_source_id: string | null;
          filename: string | null;
          status: Enums['import_status'];
          row_count: number;
          rows_imported: number;
          rows_rejected: number;
          column_mapping: Json;
          validation: Json;
          error_message: string | null;
          uploaded_by: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          data_source_id?: string | null;
          filename?: string | null;
          status?: Enums['import_status'];
          row_count?: number;
          rows_imported?: number;
          rows_rejected?: number;
          column_mapping?: Json;
          validation?: Json;
          error_message?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          data_source_id?: string | null;
          filename?: string | null;
          status?: Enums['import_status'];
          row_count?: number;
          rows_imported?: number;
          rows_rejected?: number;
          column_mapping?: Json;
          validation?: Json;
          error_message?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'data_imports_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_imports_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_imports_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      data_requests: {
        Row: {
          id: string;
          user_id: string;
          kind: Enums['data_request_kind'];
          status: Enums['data_request_status'];
          note: string | null;
          resolution: string | null;
          requested_at: string;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: Enums['data_request_kind'];
          status?: Enums['data_request_status'];
          note?: string | null;
          resolution?: string | null;
          requested_at?: string;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: Enums['data_request_kind'];
          status?: Enums['data_request_status'];
          note?: string | null;
          resolution?: string | null;
          requested_at?: string;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'data_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      data_sources: {
        Row: {
          id: string;
          organisation_id: string;
          name: string;
          category: Enums['data_source_category'];
          provider: string | null;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          category: Enums['data_source_category'];
          provider?: string | null;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          name?: string;
          category?: Enums['data_source_category'];
          provider?: string | null;
          description?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'data_sources_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'data_sources_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      departments: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          name: string;
          function: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          name: string;
          function?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          name?: string;
          function?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'departments_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'departments_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      entitlements: {
        Row: {
          key: string;
          category: string;
          name: string;
          description: string;
          kind: string;
          sort_order: number;
        };
        Insert: {
          key: string;
          category: string;
          name: string;
          description: string;
          kind?: string;
          sort_order?: number;
        };
        Update: {
          key?: string;
          category?: string;
          name?: string;
          description?: string;
          kind?: string;
          sort_order?: number;
        };
        Relationships: [
        ];
      };
      financial_records: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          department_id: string | null;
          occurred_on: string;
          category: string;
          subcategory: string | null;
          amount_cents: number;
          currency_code: string;
          direction: string;
          reference: string | null;
          data_source_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          occurred_on: string;
          category: string;
          subcategory?: string | null;
          amount_cents: number;
          currency_code?: string;
          direction: string;
          reference?: string | null;
          data_source_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          occurred_on?: string;
          category?: string;
          subcategory?: string | null;
          amount_cents?: number;
          currency_code?: string;
          direction?: string;
          reference?: string | null;
          data_source_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'financial_records_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_records_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_records_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_records_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      goal_progress: {
        Row: {
          id: string;
          organisation_id: string;
          goal_id: string;
          value: number;
          note: string | null;
          recorded_on: string;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          goal_id: string;
          value: number;
          note?: string | null;
          recorded_on?: string;
          recorded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          goal_id?: string;
          value?: number;
          note?: string | null;
          recorded_on?: string;
          recorded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goal_progress_goal_id_fkey';
            columns: ['goal_id'];
            isOneToOne: false;
            referencedRelation: 'goals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goal_progress_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goal_progress_recorded_by_fkey';
            columns: ['recorded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          department_id: string | null;
          metric_id: string | null;
          title: string;
          description: string | null;
          owner_id: string | null;
          baseline_value: number | null;
          target_value: number;
          current_value: number | null;
          unit: string;
          status: Enums['goal_status'];
          starts_on: string;
          due_on: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          metric_id?: string | null;
          title: string;
          description?: string | null;
          owner_id?: string | null;
          baseline_value?: number | null;
          target_value: number;
          current_value?: number | null;
          unit?: string;
          status?: Enums['goal_status'];
          starts_on?: string;
          due_on: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          metric_id?: string | null;
          title?: string;
          description?: string | null;
          owner_id?: string | null;
          baseline_value?: number | null;
          target_value?: number;
          current_value?: number | null;
          unit?: string;
          status?: Enums['goal_status'];
          starts_on?: string;
          due_on?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'goals_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goals_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goals_metric_id_fkey';
            columns: ['metric_id'];
            isOneToOne: false;
            referencedRelation: 'business_metrics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goals_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'goals_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      health_score_weights: {
        Row: {
          organisation_id: string;
          category: Enums['health_category'];
          weight: number;
          updated_at: string;
        };
        Insert: {
          organisation_id: string;
          category: Enums['health_category'];
          weight: number;
          updated_at?: string;
        };
        Update: {
          organisation_id?: string;
          category?: Enums['health_category'];
          weight?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'health_score_weights_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      market_signals: {
        Row: {
          id: string;
          organisation_id: string;
          market_source_id: string | null;
          kind: Enums['signal_kind'];
          sector: Enums['market_sector'];
          title: string;
          summary: string;
          detail: string | null;
          entities: string[];
          keywords: string[];
          relevance: number;
          confidence: number;
          source_url: string | null;
          observed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          market_source_id?: string | null;
          kind: Enums['signal_kind'];
          sector?: Enums['market_sector'];
          title: string;
          summary: string;
          detail?: string | null;
          entities?: string[];
          keywords?: string[];
          relevance?: number;
          confidence?: number;
          source_url?: string | null;
          observed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          market_source_id?: string | null;
          kind?: Enums['signal_kind'];
          sector?: Enums['market_sector'];
          title?: string;
          summary?: string;
          detail?: string | null;
          entities?: string[];
          keywords?: string[];
          relevance?: number;
          confidence?: number;
          source_url?: string | null;
          observed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'market_signals_market_source_id_fkey';
            columns: ['market_source_id'];
            isOneToOne: false;
            referencedRelation: 'market_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'market_signals_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      market_sources: {
        Row: {
          id: string;
          organisation_id: string | null;
          name: string;
          kind: string;
          url: string | null;
          sector_policy: Enums['market_sector'][];
          is_global: boolean;
          reliability: number;
          last_scanned_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id?: string | null;
          name: string;
          kind: string;
          url?: string | null;
          sector_policy?: Enums['market_sector'][];
          is_global?: boolean;
          reliability?: number;
          last_scanned_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string | null;
          name?: string;
          kind?: string;
          url?: string | null;
          sector_policy?: Enums['market_sector'][];
          is_global?: boolean;
          reliability?: number;
          last_scanned_at?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'market_sources_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      member_permission_overrides: {
        Row: {
          id: string;
          organisation_id: string;
          member_id: string;
          permission_key: string;
          granted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          member_id: string;
          permission_key: string;
          granted: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          member_id?: string;
          permission_key?: string;
          granted?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'member_permission_overrides_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'organisation_members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_permission_overrides_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'member_permission_overrides_permission_key_fkey';
            columns: ['permission_key'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['key'];
          },
        ];
      };
      metric_values: {
        Row: {
          id: string;
          organisation_id: string;
          metric_id: string;
          branch_id: string | null;
          department_id: string | null;
          period_start: string;
          period_end: string;
          granularity: string;
          value: number;
          data_source_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          metric_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          period_start: string;
          period_end: string;
          granularity?: string;
          value: number;
          data_source_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          metric_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          period_start?: string;
          period_end?: string;
          granularity?: string;
          value?: number;
          data_source_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'metric_values_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'metric_values_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'metric_values_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'metric_values_metric_id_fkey';
            columns: ['metric_id'];
            isOneToOne: false;
            referencedRelation: 'business_metrics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'metric_values_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      mfa_recovery_codes: {
        Row: {
          id: string;
          user_id: string;
          code_hash: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          code_hash: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          code_hash?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mfa_recovery_codes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          organisation_id: string;
          user_id: string;
          title: string;
          body: string | null;
          href: string | null;
          kind: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          user_id: string;
          title: string;
          body?: string | null;
          href?: string | null;
          kind?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          user_id?: string;
          title?: string;
          body?: string | null;
          href?: string | null;
          kind?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      onboarding_progress: {
        Row: {
          organisation_id: string;
          current_step: string;
          completed_steps: string[];
          skipped_steps: string[];
          answers: Json;
          started_at: string;
          completed_at: string | null;
          initialised_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organisation_id: string;
          current_step?: string;
          completed_steps?: string[];
          skipped_steps?: string[];
          answers?: Json;
          started_at?: string;
          completed_at?: string | null;
          initialised_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          organisation_id?: string;
          current_step?: string;
          completed_steps?: string[];
          skipped_steps?: string[];
          answers?: Json;
          started_at?: string;
          completed_at?: string | null;
          initialised_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'onboarding_progress_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: true;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      operational_records: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          department_id: string | null;
          occurred_on: string;
          measure: string;
          value: number;
          unit: string | null;
          data_source_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          occurred_on: string;
          measure: string;
          value: number;
          unit?: string | null;
          data_source_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          occurred_on?: string;
          measure?: string;
          value?: number;
          unit?: string | null;
          data_source_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operational_records_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_records_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_records_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operational_records_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunities: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          title: string;
          kind: Enums['opportunity_kind'];
          sector: Enums['market_sector'];
          counterparty: string | null;
          summary: string;
          why_it_matters: string | null;
          recommended_action: string | null;
          estimated_value_cents: number | null;
          currency_code: string;
          stage: Enums['opportunity_stage'];
          score: number | null;
          classification: string | null;
          closes_on: string | null;
          source_signal_ids: string[];
          source_urls: string[];
          is_saved: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          title: string;
          kind: Enums['opportunity_kind'];
          sector?: Enums['market_sector'];
          counterparty?: string | null;
          summary: string;
          why_it_matters?: string | null;
          recommended_action?: string | null;
          estimated_value_cents?: number | null;
          currency_code?: string;
          stage?: Enums['opportunity_stage'];
          score?: number | null;
          classification?: string | null;
          closes_on?: string | null;
          source_signal_ids?: string[];
          source_urls?: string[];
          is_saved?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          title?: string;
          kind?: Enums['opportunity_kind'];
          sector?: Enums['market_sector'];
          counterparty?: string | null;
          summary?: string;
          why_it_matters?: string | null;
          recommended_action?: string | null;
          estimated_value_cents?: number | null;
          currency_code?: string;
          stage?: Enums['opportunity_stage'];
          score?: number | null;
          classification?: string | null;
          closes_on?: string | null;
          source_signal_ids?: string[];
          source_urls?: string[];
          is_saved?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'opportunities_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunities_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunity_activities: {
        Row: {
          id: string;
          organisation_id: string;
          opportunity_id: string;
          actor_id: string | null;
          kind: string;
          body: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          opportunity_id: string;
          actor_id?: string | null;
          kind: string;
          body?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          opportunity_id?: string;
          actor_id?: string | null;
          kind?: string;
          body?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'opportunity_activities_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_activities_opportunity_id_fkey';
            columns: ['opportunity_id'];
            isOneToOne: false;
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_activities_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunity_assignments: {
        Row: {
          id: string;
          organisation_id: string;
          opportunity_id: string;
          assignee_id: string;
          assigned_by: string | null;
          due_on: string | null;
          note: string | null;
          released_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          opportunity_id: string;
          assignee_id: string;
          assigned_by?: string | null;
          due_on?: string | null;
          note?: string | null;
          released_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          opportunity_id?: string;
          assignee_id?: string;
          assigned_by?: string | null;
          due_on?: string | null;
          note?: string | null;
          released_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'opportunity_assignments_assigned_by_fkey';
            columns: ['assigned_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_assignments_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_assignments_opportunity_id_fkey';
            columns: ['opportunity_id'];
            isOneToOne: false;
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_assignments_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunity_score_weights: {
        Row: {
          organisation_id: string;
          weights: Json;
          updated_at: string;
        };
        Insert: {
          organisation_id: string;
          weights?: Json;
          updated_at?: string;
        };
        Update: {
          organisation_id?: string;
          weights?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'opportunity_score_weights_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: true;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      opportunity_scores: {
        Row: {
          id: string;
          organisation_id: string;
          opportunity_id: string;
          relevance: number;
          potential_value: number;
          strategic_alignment: number;
          urgency: number;
          confidence: number;
          competition: number;
          total: number;
          weights: Json;
          rationale: string | null;
          scored_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          opportunity_id: string;
          relevance: number;
          potential_value: number;
          strategic_alignment: number;
          urgency: number;
          confidence: number;
          competition: number;
          total: number;
          weights?: Json;
          rationale?: string | null;
          scored_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          opportunity_id?: string;
          relevance?: number;
          potential_value?: number;
          strategic_alignment?: number;
          urgency?: number;
          confidence?: number;
          competition?: number;
          total?: number;
          weights?: Json;
          rationale?: string | null;
          scored_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'opportunity_scores_opportunity_id_fkey';
            columns: ['opportunity_id'];
            isOneToOne: false;
            referencedRelation: 'opportunities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'opportunity_scores_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      organisation_invitations: {
        Row: {
          id: string;
          organisation_id: string;
          email: string;
          role: Enums['org_role'];
          scope_kind: Enums['scope_kind'];
          scope_ids: string[];
          token_hash: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          email: string;
          role?: Enums['org_role'];
          scope_kind?: Enums['scope_kind'];
          scope_ids?: string[];
          token_hash: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          email?: string;
          role?: Enums['org_role'];
          scope_kind?: Enums['scope_kind'];
          scope_ids?: string[];
          token_hash?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organisation_invitations_accepted_by_fkey';
            columns: ['accepted_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organisation_invitations_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organisation_invitations_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      organisation_members: {
        Row: {
          id: string;
          organisation_id: string;
          user_id: string;
          role: Enums['org_role'];
          status: Enums['member_status'];
          scope_kind: Enums['scope_kind'];
          scope_ids: string[];
          invited_by: string | null;
          invited_at: string | null;
          joined_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          user_id: string;
          role?: Enums['org_role'];
          status?: Enums['member_status'];
          scope_kind?: Enums['scope_kind'];
          scope_ids?: string[];
          invited_by?: string | null;
          invited_at?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          user_id?: string;
          role?: Enums['org_role'];
          status?: Enums['member_status'];
          scope_kind?: Enums['scope_kind'];
          scope_ids?: string[];
          invited_by?: string | null;
          invited_at?: string | null;
          joined_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organisation_members_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organisation_members_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organisation_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      organisations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          industry: string | null;
          country_code: string;
          currency_code: string;
          timezone: string;
          fiscal_year_start: number;
          strategy_profile: Json;
          settings: Json;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          sector_scope: Enums['market_sector'][];
          dpa_accepted_at: string | null;
          dpa_version: string | null;
          dpa_accepted_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          industry?: string | null;
          country_code?: string;
          currency_code?: string;
          timezone?: string;
          fiscal_year_start?: number;
          strategy_profile?: Json;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          sector_scope?: Enums['market_sector'][];
          dpa_accepted_at?: string | null;
          dpa_version?: string | null;
          dpa_accepted_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          industry?: string | null;
          country_code?: string;
          currency_code?: string;
          timezone?: string;
          fiscal_year_start?: number;
          strategy_profile?: Json;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          sector_scope?: Enums['market_sector'][];
          dpa_accepted_at?: string | null;
          dpa_version?: string | null;
          dpa_accepted_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'organisations_dpa_accepted_by_fkey';
            columns: ['dpa_accepted_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions: {
        Row: {
          key: string;
          category: string;
          description: string;
        };
        Insert: {
          key: string;
          category: string;
          description: string;
        };
        Update: {
          key?: string;
          category?: string;
          description?: string;
        };
        Relationships: [
        ];
      };
      plan_entitlements: {
        Row: {
          plan: Enums['subscription_plan'];
          entitlement_key: string;
          included: boolean;
          limit_value: number | null;
        };
        Insert: {
          plan: Enums['subscription_plan'];
          entitlement_key: string;
          included?: boolean;
          limit_value?: number | null;
        };
        Update: {
          plan?: Enums['subscription_plan'];
          entitlement_key?: string;
          included?: boolean;
          limit_value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_entitlements_entitlement_key_fkey';
            columns: ['entitlement_key'];
            isOneToOne: false;
            referencedRelation: 'entitlements';
            referencedColumns: ['key'];
          },
          {
            foreignKeyName: 'plan_entitlements_plan_fkey';
            columns: ['plan'];
            isOneToOne: false;
            referencedRelation: 'subscription_plans';
            referencedColumns: ['plan'];
          },
        ];
      };
      rate_limits: {
        Row: {
          bucket: string;
          attempts: number;
          window_start: string;
          updated_at: string;
        };
        Insert: {
          bucket: string;
          attempts?: number;
          window_start?: string;
          updated_at?: string;
        };
        Update: {
          bucket?: string;
          attempts?: number;
          window_start?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      regions: {
        Row: {
          id: string;
          organisation_id: string;
          name: string;
          code: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          name: string;
          code?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          name?: string;
          code?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'regions_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          id: string;
          organisation_id: string;
          kind: string;
          title: string;
          parameters: Json;
          content: Json;
          period_start: string | null;
          period_end: string | null;
          generated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          kind: string;
          title: string;
          parameters?: Json;
          content?: Json;
          period_start?: string | null;
          period_end?: string | null;
          generated_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          kind?: string;
          title?: string;
          parameters?: Json;
          content?: Json;
          period_start?: string | null;
          period_end?: string | null;
          generated_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_generated_by_fkey';
            columns: ['generated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      risk_events: {
        Row: {
          id: string;
          organisation_id: string;
          risk_id: string;
          actor_id: string | null;
          kind: string;
          body: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          risk_id: string;
          actor_id?: string | null;
          kind: string;
          body?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          risk_id?: string;
          actor_id?: string | null;
          kind?: string;
          body?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'risk_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_events_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_events_risk_id_fkey';
            columns: ['risk_id'];
            isOneToOne: false;
            referencedRelation: 'risks';
            referencedColumns: ['id'];
          },
        ];
      };
      risks: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          title: string;
          description: string | null;
          category: string;
          likelihood: number;
          impact: number;
          severity: Enums['priority_level'];
          status: Enums['risk_status'];
          owner_id: string | null;
          mitigation: string | null;
          review_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          title: string;
          description?: string | null;
          category?: string;
          likelihood?: number;
          impact?: number;
          severity?: Enums['priority_level'];
          status?: Enums['risk_status'];
          owner_id?: string | null;
          mitigation?: string | null;
          review_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          title?: string;
          description?: string | null;
          category?: string;
          likelihood?: number;
          impact?: number;
          severity?: Enums['priority_level'];
          status?: Enums['risk_status'];
          owner_id?: string | null;
          mitigation?: string | null;
          review_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'risks_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risks_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risks_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          role: Enums['org_role'];
          permission_key: string;
        };
        Insert: {
          role: Enums['org_role'];
          permission_key: string;
        };
        Update: {
          role?: Enums['org_role'];
          permission_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_key_fkey';
            columns: ['permission_key'];
            isOneToOne: false;
            referencedRelation: 'permissions';
            referencedColumns: ['key'];
          },
        ];
      };
      sales_records: {
        Row: {
          id: string;
          organisation_id: string;
          branch_id: string | null;
          department_id: string | null;
          occurred_on: string;
          customer_ref: string | null;
          customer_name: string | null;
          product_line: string | null;
          quantity: number;
          amount_cents: number;
          currency_code: string;
          margin_cents: number | null;
          data_source_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          branch_id?: string | null;
          department_id?: string | null;
          occurred_on: string;
          customer_ref?: string | null;
          customer_name?: string | null;
          product_line?: string | null;
          quantity?: number;
          amount_cents: number;
          currency_code?: string;
          margin_cents?: number | null;
          data_source_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          branch_id?: string | null;
          department_id?: string | null;
          occurred_on?: string;
          customer_ref?: string | null;
          customer_name?: string | null;
          product_line?: string | null;
          quantity?: number;
          amount_cents?: number;
          currency_code?: string;
          margin_cents?: number | null;
          data_source_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sales_records_branch_id_fkey';
            columns: ['branch_id'];
            isOneToOne: false;
            referencedRelation: 'branches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_records_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_records_department_id_fkey';
            columns: ['department_id'];
            isOneToOne: false;
            referencedRelation: 'departments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sales_records_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      strategic_initiatives: {
        Row: {
          id: string;
          organisation_id: string;
          title: string;
          thesis: string | null;
          owner_id: string | null;
          status: string;
          goal_ids: string[];
          opportunity_ids: string[];
          starts_on: string | null;
          ends_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          title: string;
          thesis?: string | null;
          owner_id?: string | null;
          status?: string;
          goal_ids?: string[];
          opportunity_ids?: string[];
          starts_on?: string | null;
          ends_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          title?: string;
          thesis?: string | null;
          owner_id?: string | null;
          status?: string;
          goal_ids?: string[];
          opportunity_ids?: string[];
          starts_on?: string | null;
          ends_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'strategic_initiatives_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: false;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'strategic_initiatives_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_activations: {
        Row: {
          id: string;
          organisation_id: string;
          plan: Enums['subscription_plan'];
          term_months: number;
          amount_cents: number;
          currency_code: string;
          reference: string;
          state: string;
          requested_by: string | null;
          requested_at: string;
          token_hash: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          payment_note: string | null;
          expires_at: string | null;
          activated_at: string | null;
          activated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          plan: Enums['subscription_plan'];
          term_months?: number;
          amount_cents: number;
          currency_code?: string;
          reference: string;
          state?: string;
          requested_by?: string | null;
          requested_at?: string;
          token_hash?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          payment_note?: string | null;
          expires_at?: string | null;
          activated_at?: string | null;
          activated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          plan?: Enums['subscription_plan'];
          term_months?: number;
          amount_cents?: number;
          currency_code?: string;
          reference?: string;
          state?: string;
          requested_by?: string | null;
          requested_at?: string;
          token_hash?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          payment_note?: string | null;
          expires_at?: string | null;
          activated_at?: string | null;
          activated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscription_activations_activated_by_fkey';
            columns: ['activated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_activations_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_activations_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: true;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscription_activations_requested_by_fkey';
            columns: ['requested_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      subscription_plans: {
        Row: {
          plan: Enums['subscription_plan'];
          name: string;
          tagline: string;
          price_cents_monthly: number | null;
          price_cents_annual: number | null;
          currency_code: string;
          seats: number;
          data_source_limit: number | null;
          ai_credits_monthly: number;
          trial_days: number;
          contact_sales: boolean;
          is_public: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          plan: Enums['subscription_plan'];
          name: string;
          tagline: string;
          price_cents_monthly?: number | null;
          price_cents_annual?: number | null;
          currency_code?: string;
          seats?: number;
          data_source_limit?: number | null;
          ai_credits_monthly?: number;
          trial_days?: number;
          contact_sales?: boolean;
          is_public?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          plan?: Enums['subscription_plan'];
          name?: string;
          tagline?: string;
          price_cents_monthly?: number | null;
          price_cents_annual?: number | null;
          currency_code?: string;
          seats?: number;
          data_source_limit?: number | null;
          ai_credits_monthly?: number;
          trial_days?: number;
          contact_sales?: boolean;
          is_public?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          organisation_id: string;
          plan: Enums['subscription_plan'];
          status: Enums['subscription_status'];
          seats: number;
          data_source_limit: number | null;
          ai_credits_monthly: number;
          ai_credits_used: number;
          price_cents_monthly: number;
          currency_code: string;
          trial_ends_at: string | null;
          current_period_start: string;
          current_period_end: string;
          created_at: string;
          updated_at: string;
          cancel_at_period_end: boolean;
          cancelled_at: string | null;
          grace_until: string | null;
          last_payment_at: string | null;
          activated_at: string | null;
          activated_by: string | null;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          plan?: Enums['subscription_plan'];
          status?: Enums['subscription_status'];
          seats?: number;
          data_source_limit?: number | null;
          ai_credits_monthly?: number;
          ai_credits_used?: number;
          price_cents_monthly?: number;
          currency_code?: string;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          created_at?: string;
          updated_at?: string;
          cancel_at_period_end?: boolean;
          cancelled_at?: string | null;
          grace_until?: string | null;
          last_payment_at?: string | null;
          activated_at?: string | null;
          activated_by?: string | null;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          plan?: Enums['subscription_plan'];
          status?: Enums['subscription_status'];
          seats?: number;
          data_source_limit?: number | null;
          ai_credits_monthly?: number;
          ai_credits_used?: number;
          price_cents_monthly?: number;
          currency_code?: string;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          created_at?: string;
          updated_at?: string;
          cancel_at_period_end?: boolean;
          cancelled_at?: string | null;
          grace_until?: string | null;
          last_payment_at?: string | null;
          activated_at?: string | null;
          activated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_activated_by_fkey';
            columns: ['activated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'subscriptions_organisation_id_fkey';
            columns: ['organisation_id'];
            isOneToOne: true;
            referencedRelation: 'organisations';
            referencedColumns: ['id'];
          },
        ];
      };
      user_profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          job_title: string | null;
          avatar_url: string | null;
          locale: string;
          theme: string;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
          terms_accepted_at: string | null;
          terms_version: string | null;
          privacy_accepted_at: string | null;
          privacy_version: string | null;
          mfa_enabled: boolean;
          mfa_enabled_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          job_title?: string | null;
          avatar_url?: string | null;
          locale?: string;
          theme?: string;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          privacy_accepted_at?: string | null;
          privacy_version?: string | null;
          mfa_enabled?: boolean;
          mfa_enabled_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          job_title?: string | null;
          avatar_url?: string | null;
          locale?: string;
          theme?: string;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          privacy_accepted_at?: string | null;
          privacy_version?: string | null;
          mfa_enabled?: boolean;
          mfa_enabled_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      organisation_entitlements: {
        Row: {
          organisation_id: string | null;
          entitlement_key: string | null;
          category: string | null;
          name: string | null;
          description: string | null;
          kind: string | null;
          sort_order: number | null;
          included: boolean | null;
          limit_value: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_invitation: {
        Args: {
          p_token: string;
        };
        Returns: string;
      };
      activation_preview: {
        Args: {
          p_token: string;
        };
        Returns: Record<string, unknown>[];
      };
      apply_subscription_plan: {
        Args: {
          p_organisation: string;
          p_plan: string;
          p_status?: string | null;
          p_period_start?: string | null;
          p_period_end?: string | null;
        };
        Returns: Database['public']['Tables']['subscriptions']['Row'];
      };
      check_rate_limit: {
        Args: {
          p_bucket: string;
          p_max: number;
          p_window: string;
        };
        Returns: boolean;
      };
      complete_onboarding: {
        Args: {
          p_organisation: string;
        };
        Returns: Database['public']['Tables']['onboarding_progress']['Row'];
      };
      create_organisation: {
        Args: {
          p_name: string;
          p_slug: string;
          p_industry?: string | null;
          p_country_code?: string | null;
          p_currency_code?: string | null;
        };
        Returns: string;
      };
      ensure_onboarding: {
        Args: {
          p_organisation: string;
        };
        Returns: Database['public']['Tables']['onboarding_progress']['Row'];
      };
      ensure_user_profile: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      invitation_preview: {
        Args: {
          p_token: string;
        };
        Returns: Record<string, unknown>[];
      };
      issue_activation: {
        Args: {
          p_activation: string;
          p_token_hash: string;
          p_confirmed_by?: string | null;
          p_note?: string | null;
          p_valid_for?: string | null;
        };
        Returns: Database['public']['Tables']['subscription_activations']['Row'];
      };
      record_account_event: {
        Args: {
          p_action: string;
          p_summary?: string | null;
        };
        Returns: undefined;
      };
      record_security_event: {
        Args: {
          p_organisation_id: string;
          p_action: string;
          p_entity_type?: string | null;
          p_entity_id?: string | null;
          p_summary?: string | null;
          p_metadata?: Json | null;
        };
        Returns: undefined;
      };
      redeem_activation: {
        Args: {
          p_token: string;
        };
        Returns: Database['public']['Tables']['subscriptions']['Row'];
      };
      redeem_recovery_code: {
        Args: {
          p_hash: string;
        };
        Returns: boolean;
      };
      replace_recovery_codes: {
        Args: {
          p_hashes: string[];
        };
        Returns: undefined;
      };
      request_subscription: {
        Args: {
          p_plan: string;
          p_term_months?: number | null;
        };
        Returns: Database['public']['Tables']['subscription_activations']['Row'];
      };
    };
    Enums: Enums;
    CompositeTypes: { [_ in never]: never };
  };
}

/** Row shorthand: `Row<'opportunities'>`. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
/** Views are read-only, so they have a Row and nothing else. */
export type ViewRow<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row'];
