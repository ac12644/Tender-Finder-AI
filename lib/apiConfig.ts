/**
 * API Configuration - Centralized URL management
 *
 * Uses production Firebase Functions URL by default.
 * Can be overridden with NEXT_PUBLIC_TENDER_API_BASE environment variable.
 */

function getBaseUrl(): string {
  // Priority 1: Explicit environment variable (highest priority)
  if (process.env.NEXT_PUBLIC_TENDER_API_BASE) {
    return process.env.NEXT_PUBLIC_TENDER_API_BASE;
  }

  // Default: Always use production Firebase Functions URL
  return "https://europe-west1-tender-fc022.cloudfunctions.net";
}

export const API_BASE_URL = getBaseUrl();
