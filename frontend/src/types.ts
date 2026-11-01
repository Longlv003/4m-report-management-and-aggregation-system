export interface User {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export interface Scan4MRecord {
  id: string;
  match_key: string;
  match_status: 'MATCHED' | 'UNMATCHED_PLUS' | 'CONFLICT_DUPLICATE';
  date: string;
  machine: string;
  shift: string;
  start_time: string;
  finish_time: string | null;
  total_time: string | null;
  item_name: string;
  item_code: string;
  lot_no: string;
  seq_no: string;
  process: string;
  layer: string;
  program_name: string;
  total_sheet_indi: number | null;
  total_sheet_scan: number | null;
  op: string;
  outer_top_avg_a: number | null;
  cpk_outer_top_a: number | null;
  inner_bottom_avg_a: number | null;
  cpk_inner_bottom_a: number | null;
  outer_top_avg_b: number | null;
  cpk_outer_top_b: number | null;
  inner_bottom_avg_b: number | null;
  cpk_inner_bottom_b: number | null;
  check_light: string;
  check_master_machine: string;
  check_master_sample: string;
  exp_master_sample: string;
  roll_cleaning: string;
  air_pressure: number | null;
  anomaly_flag: string | null;
}

export interface DashboardStats {
  totalRecords: number;
  matchedRecords: number;
  unmatchedRecords: number;
  anomalyRecords: number;
  failedFiles: number;
  failedFileNames: string | null;
  processedFiles: number;
  lastScanTime: string | null;
}

export interface AccountItem {
  id: string;
  username: string;
  full_name: string;
  role_id: string;
  role_name: string;
  permissions: string[];
  is_active: number;
  created_at: string;
}

export interface ItemMapping {
  id: string;
  item_name: string;
  pcs_per_sheet: number;
  process: string;
  is_deleted: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Cvr4mRecord {
  id: string;
  wcs_file_id: string | null;
  match_status: 'MATCHED' | 'MATCHED_ERROR_ONLY' | 'UNMATCHED_PLUS';
  date: string;
  machine: string;
  shift: string;
  start_time: string;
  finish_time: string | null;
  total_time: string | null;
  item_name: string;
  item_code: string;
  lot_no: string;
  seq_no: string;
  process: string;
  program_name: string;
  total_sheet_indi: number | null;
  total_sheet_vrf: number | null;
  op: string;
  total_pcs: number | null;
  total_pattern_ng: number | null;
  ng_rate: number | null;
  accumulative_defect_a: number | null;
  ng_rate_a: number | null;
  discoloration_a: number | null;
  fm_a: number | null;
  copper_residue_a: number | null;
  broken_hole_a: number | null;
  bvh_shift_a: number | null;
  missing_hole_a: number | null;
  extra_hole_a: number | null;
  dfr_seepage_a: number | null;
  other_a: number | null;
  dfr_remain_a: number | null;
  verify_zoom_a: string | null;
  accumulative_defect_b: number | null;
  ng_rate_b: number | null;
  discoloration_b: number | null;
  fm_b: number | null;
  copper_residue_b: number | null;
  broken_hole_b: number | null;
  bvh_shift_b: number | null;
  missing_hole_b: number | null;
  extra_hole_b: number | null;
  dfr_seepage_b: number | null;
  other_b: number | null;
  dfr_remain_b: number | null;
  verify_zoom_b: string | null;
}

export interface CvrDashboardStats {
  total: number;
  matched: number;
  unmatched: number;
  failedFiles: number;
  failedFileNames: string | null;
  totalNg: number;
  avgNgRate: number;
  totalSheetsVrf: number;
  matchRate: number;
  topMachines: Array<{ machine: string; count: number; totalNg: number }>;
}


export interface AuditRecord {
  id: string; account_id: string | null; username: string; action: string; resource: string;
  outcome: 'SUCCESS' | 'FAILED' | 'STARTED'; details: string | null; ip_address: string | null; created_at: string;
}
