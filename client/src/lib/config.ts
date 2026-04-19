/**
 * Centralized API configuration for the BPER OptiNext platform.
 * In development, it defaults to localhost:5000.
 * In production (Vercel), it uses the VITE_API_URL environment variable.
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const API_ENDPOINTS = {
  AUTH: `${API_BASE_URL}/api/auth`,
  ANALYSIS: `${API_BASE_URL}/api/analysis`,
  WDT: `${API_BASE_URL}/api/wdt`,
  FITMENT: `${API_BASE_URL}/api/fitment`,
  TAXONOMY: `${API_BASE_URL}/api/taxonomy`,
  REPORTS: `${API_BASE_URL}/api/reports`,
  ACTIVITIES: `${API_BASE_URL}/api/activities`,
};
