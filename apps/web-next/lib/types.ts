export type AnalysisStatus = "uploaded" | "queued" | "running" | "completed" | "failed";

export interface RunSummary {
  id: string;
  filename: string;
  status: AnalysisStatus;
  progress: number;
  stage?: string | null;
  stage_detail?: string | null;
  stage_updated_at?: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunDetail extends RunSummary {
  metadata?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  chart_names: string[];
  markers: Marker[];
  conversions?: ConversionState;
  mastering?: MasteringState;
}

export interface UploadResponse {
  run: RunSummary;
  metadata: Record<string, unknown>;
}

export interface UpdateStatus {
  product: string;
  author: string;
  version: string;
  repository: string;
  branch: string;
  current_commit: string | null;
  remote_commit: string;
  update_available: boolean;
  update_supported: boolean;
  working_tree_dirty: boolean;
  message: string;
}

export interface UpdateResult {
  updated: boolean;
  previous_commit: string;
  current_commit: string;
  restart_required: boolean;
  message: string;
}

export interface Marker {
  type: string;
  start_seconds: number;
  end_seconds: number;
  severity?: string;
  message?: string;
}

export type ChartPayload = Record<string, unknown>;
export type ChartsPayload = Record<string, ChartPayload>;

export type ConversionStatus = "idle" | "queued" | "running" | "completed" | "failed";

export interface ConvertedFile {
  format: string;
  filename: string;
  path: string;
  size_bytes: number;
  size_megabytes?: number;
  codec?: string;
  container?: string;
  duration_seconds?: number;
  sample_rate?: number;
  channels?: number;
  bitrate?: number;
}

export interface ConversionManifest {
  created_at: string;
  source_file: string;
  source_filename: string;
  files: ConvertedFile[];
}

export interface ConversionState {
  status: ConversionStatus;
  progress: number;
  error_message?: string | null;
  requested_formats: string[];
  completed_formats: string[];
  updated_at: string;
  manifest?: ConversionManifest | null;
}

export type MasteringStatus = "idle" | "queued" | "running" | "completed" | "failed";

export interface MasteringOutput {
  id: string;
  filename: string;
  path: string;
  size_bytes: number;
  size_megabytes?: number;
  sha256?: string | null;
  sample_rate?: number;
  channels?: number;
  duration_seconds?: number;
  score?: number;
  metrics?: Record<string, unknown>;
}

export interface MasteringSelfCheckProfile {
  integrated_lufs?: number;
  target_lufs?: number;
  true_peak_dbfs?: number;
  target_true_peak_dbfs?: number;
  marker_counts?: Record<string, number>;
  issue_score?: number;
}

export interface MasteringSelfCheck {
  assessment?: string;
  best_output_id?: string;
  score_before?: number;
  score_after?: number;
  score_delta?: number;
  resolved?: string[];
  improved?: string[];
  remaining?: string[];
  worsened?: string[];
  recommended_fixes?: Array<Record<string, unknown>>;
  compliance_source?: Record<string, unknown>;
  compliance_mastered?: Record<string, unknown>;
  post_check_repair?: Record<string, unknown>;
  source?: MasteringSelfCheckProfile;
  mastered?: MasteringSelfCheckProfile;
}

export interface MasteringManifest {
  created_at: string;
  source_file: string;
  source_filename: string;
  mode: string;
  preset: string;
  target_lufs: number;
  target_true_peak_dbfs: number;
  request_settings?: Record<string, unknown>;
  applied_settings?: Record<string, unknown>;
  best_output_id?: string;
  outputs: MasteringOutput[];
  adaptation?: Record<string, unknown>;
  optimizer?: Record<string, unknown>;
  stems?: Record<string, unknown>;
  backend?: Record<string, unknown>;
  refinement?: Record<string, unknown>;
  pro_features?: Record<string, unknown>;
  self_check?: MasteringSelfCheck;
}

export interface MasteringState {
  status: MasteringStatus;
  progress: number;
  error_message?: string | null;
  mode: string;
  preset: string;
  backend?: string;
  stage?: string;
  detail?: string;
  updated_at: string;
  manifest?: MasteringManifest | null;
}
