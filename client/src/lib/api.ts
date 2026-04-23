/**
 * Production API utility for BPER-OPTINEXT2
 * Centralizes authentication headers and error handling.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
import * as XLSX from 'xlsx';

const BASE_URL = `${API_BASE_URL}/api`;

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('bper.auth.token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
    
    // Global Security Audit: Handle Expired Tokens
    if (response.status === 401) {
      console.warn('Session expired or unauthorized. Clearing session and redirecting.');
      localStorage.removeItem('bper.auth.token');
      localStorage.removeItem('bper.auth.user');
      
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login'; 
      }
      throw new Error('Unauthorized');
    }

    return response;
  } catch (error) {
    console.error(`API Fetch Error [${endpoint}]:`, error);
    throw error;
  }
}

export async function apiGetJson<T>(endpoint: string): Promise<T> {
  const response = await apiFetch(endpoint);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const message = data?.message || `Request failed with status ${response.status}`;
    console.error(`API Error [${endpoint}]:`, { status: response.status, message, data });
    throw new Error(message);
  }

  return data as T;
}

export function getDashboardReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/dashboard${query}`);
}

export function getUtilizationReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/utilization${query}`);
}

export function getFteSummaryReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/fte-summary${query}`);
}

export function getFteConsolidationSummaryReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/fte-consolidation-summary${query}`);
}

export function getFitmentSummaryReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/fitment-summary${query}`);
}

export function getEmployeeFitment(employeeId: string) {
  return apiGetJson<any>(`/fitment/${encodeURIComponent(employeeId)}`);
}

export async function updateEmployeeFitment(employeeId: string, parameters: any[]) {
  const response = await apiFetch('/fitment', {
    method: 'POST',
    body: JSON.stringify({ employeeId, parameters })
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to save fitment profile');
  }
  return data;
}

// Phase 9: Deep Analysis Reports
export function getFteAnalysisReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/fte-analysis${query}`);
}

export function getConsolidationAnalysisReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/consolidation-analysis${query}`);
}

export function getFitmentAnalysisReport() {
  return apiGetJson<any>('/reports/fitment-analysis');
}

export function getUtilizationAnalysisReport(department?: string) {
  const query = department && department !== 'All Departments'
    ? `?department=${encodeURIComponent(department)}`
    : '';
  return apiGetJson<any>(`/reports/utilization-analysis${query}`);
}

// Process Management - Activities API
export interface Tower {
  name: string;
  processCount: number;
}

export interface Process {
  name: string;
  activityCount: number;
}

export interface Activity {
  _id: string;
  name: string;
  isCustom: boolean;
  automationPotential: string;
  addedBy?: string;
  description?: string;
}

export interface SearchActivity {
  _id: string;
  name: string;
  department: { name: string };
  tower: { name: string };
  process: { name: string };
  isCustom: boolean;
  automationPotential: string;
}

export async function getTowersForDepartment(deptId: string): Promise<Tower[]> {
  return apiGetJson<Tower[]>(`/activities/towers/${encodeURIComponent(deptId)}`);
}

export async function getProcessesForTower(towerId: string): Promise<Process[]> {
  return apiGetJson<Process[]>(`/activities/processes/${encodeURIComponent(towerId)}`);
}

export async function getActivitiesForProcess(tower: string, process: string): Promise<Activity[]> {
  const query = `?tower=${encodeURIComponent(tower)}&process=${encodeURIComponent(process)}`;
  return apiGetJson<Activity[]>(`/activities/list${query}`);
}

export async function searchActivities(searchTerm: string, deptId?: string): Promise<SearchActivity[]> {
  const query = deptId 
    ? `?q=${encodeURIComponent(searchTerm || '')}&deptId=${encodeURIComponent(deptId)}`
    : `?q=${encodeURIComponent(searchTerm || '')}`;
  return apiGetJson<SearchActivity[]>(`/activities/search${query}`);
}

export async function getTaxonomyProcesses(deptId?: string): Promise<any[]> {
  const query = deptId && deptId !== 'All' ? `?department=${encodeURIComponent(deptId)}` : '';
  return apiGetJson<any[]>(`/taxonomy/processes${query}`);
}

export async function createCustomActivity(payload: {
  departmentId: string;
  towerId: string;
  processId: string;
  name: string;
  description?: string;
  automationPotential?: string;
  notes?: string;
}): Promise<{ message: string; activity: any }> {
  const response = await apiFetch('/activities/custom', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create custom activity');
  }

  return data;
}

export async function createCustomTower(payload: {
  departmentId: string;
  name: string;
}): Promise<{ message: string; tower: Tower }> {
  const response = await apiFetch('/activities/tower/custom', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create tower');
  }

  return data;
}

export async function createCustomProcess(payload: {
  towerId: string;
  departmentId: string;
  name: string;
}): Promise<{ message: string; process: Process }> {
  const response = await apiFetch('/activities/process/custom', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to create process');
  }

  return data;
}

// CSV Export Helper
export function exportToCSV(data: any[], filename: string, headers?: string[]) {
  if (!data || data.length === 0) {
    console.error('No data to export');
    return;
  }

  const keys = headers || Object.keys(data[0]);
  const csv = [
    keys.join(','),
    ...data.map((row) =>
      keys
        .map((key) => {
          const value = row[key];
          if (value === null || value === undefined) return '';
          const str = String(value);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Frontend Excel Export Helper using xlsx
export function exportToExcelClient(data: any[], filename: string, headers?: string[]) {
  if (!data || data.length === 0) {
    console.error('No data to export');
    return;
  }

  // Filter out any metadata fields starting with underscore (like _id) if we want, or just leave as is
  const ws = XLSX.utils.json_to_sheet(data);
  if (headers && headers.length > 0) {
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' });
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  // Generate file and trigger download
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}-${dateStr}.xlsx`);
}

/**
 * Download an Excel file from an API export endpoint.
 * @param endpoint - API path, e.g. '/export/wdt-submissions'
 * @param filename - suggested download filename (without extension)
 * @param queryParams - optional query string parameters
 */
export async function downloadExcel(endpoint: string, filename: string, queryParams?: Record<string, string>) {
  const token = localStorage.getItem('bper.auth.token');
  const qs = queryParams ? '?' + new URLSearchParams(queryParams).toString() : '';
  const url = `${API_BASE_URL}/api${endpoint}${qs}`;

  const response = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || `Export failed (${response.status})`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  const dateStr = new Date().toISOString().slice(0, 10);
  link.download = `${filename}-${dateStr}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
