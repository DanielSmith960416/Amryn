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
  data_source_category: 'accounting' | 'crm' | 'pos' | 'erp' | 'spreadsheet' | 'database' | 'api' | 'manual';
  event_kind: 'anomaly' | 'trend' | 'threshold' | 'milestone' | 'ingestion' | 'manual';
  goal_status: 'draft' | 'active' | 'at_risk' | 'achieved' | 'missed' | 'cancelled';
  health_category: 'financial' | 'operational' | 'sales' | 'growth' | 'customer' | 'strategic';
  import_status: 'uploaded' | 'mapping' | 'validating' | 'ready' | 'importing' | 'complete' | 'failed';
  market_sector: 'private' | 'public' | 'mixed' | 'unknown';
  member_status: 'invited' | 'active' | 'suspended';
  metric_kind: 'financial' | 'sales' | 'operational' | 'customer' | 'employee' | 'growth' | 'custom';
  opportunity_kind: 'market_expansion' | 'partnership' | 'supplier' | 'distribution' | 'customer_acquisition' | 'product' | 'competitive_gap' | 'investment';
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
        };
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
      };
      subscriptions: {
        Row: {
          id: string;
          organisation_id: string;
          plan: Enums['subscription_plan'];
          status: Enums['subscription_status'];
          seats: number;
          data_source_limit: number;
          ai_credits_monthly: number;
          ai_credits_used: number;
          price_cents_monthly: number;
          currency_code: string;
          trial_ends_at: string | null;
          current_period_start: string;
          current_period_end: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organisation_id: string;
          plan?: Enums['subscription_plan'];
          status?: Enums['subscription_status'];
          seats?: number;
          data_source_limit?: number;
          ai_credits_monthly?: number;
          ai_credits_used?: number;
          price_cents_monthly?: number;
          currency_code?: string;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organisation_id?: string;
          plan?: Enums['subscription_plan'];
          status?: Enums['subscription_status'];
          seats?: number;
          data_source_limit?: number;
          ai_credits_monthly?: number;
          ai_credits_used?: number;
          price_cents_monthly?: number;
          currency_code?: string;
          trial_ends_at?: string | null;
          current_period_start?: string;
          current_period_end?: string;
          created_at?: string;
          updated_at?: string;
        };
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
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_organisation: {
        Args: {
          p_name: string;
          p_slug: string;
          p_industry?: string | null;
          p_country_code?: string;
          p_currency_code?: string;
        };
        Returns: string;
      };
    };
    Enums: Enums;
  };
}

/** Row shorthand: `Row<'opportunities'>`. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateRow<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
