/**
 * Firebase Cloud Functions Entry Point
 *
 * Central export file for all HTTP endpoints and background jobs.
 * Functions are organized by feature area for better maintainability.
 */

// ============================================================================
// Background Jobs
// ============================================================================

export { tedPull } from "./jobs/pull";
export { tendersProcess } from "./jobs/process";
export { instantAlerts } from "./jobs/instantAlerts";

// ============================================================================
// User Preferences & Feed
// ============================================================================

export { preferences } from "./api/preferences";
export { feed } from "./api/feed";
export { suggestions } from "./api/suggestions";

// ============================================================================
// Company Profile & Analysis
// ============================================================================

export {
  getCompanyProfile,
  upsertCompanyProfile,
  getBestTenders,
  analyzeEligibility,
  getPersonalizedRecommendations,
} from "./api/company";

// ============================================================================
// Tender Management
// ============================================================================

export {
  tendersList,
  tenderGet,
  tendersSearch,
  tenderSaveSummary,
  matchSave,
  saveFavorite,
} from "./api/tenders";

// ============================================================================
// AI Agent Endpoints
// ============================================================================

export { agentChat } from "./graph/agentChat";
export { agentChatStream } from "./graph/agentChatStream";

// ============================================================================
// Application Management
// ============================================================================

export { applications } from "./api/applications";

// ============================================================================
// Data Export & Digest
// ============================================================================

export { exportCsv } from "./api/export";
export { digestDaily } from "./api/digest";
export { events } from "./api/events";

// ============================================================================
// Admin & Monitoring
// ============================================================================

export { getAdminMetrics } from "./api/admin/metrics";
