/**
 * Production API utility for BPER-OPTINEXT2
 * Centralizes authentication headers and error handling.
 */

const BASE_URL = 'http://localhost:5000/api';

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
    if (response.status === 401 || response.status === 403) {
      console.warn('Session expired or unauthorized. Clearing session and redirecting.');
      localStorage.removeItem('bper.auth.token');
      localStorage.removeItem('bper.auth.user');
      
      if (typeof window !== 'undefined') {
        window.location.href = '/'; 
      }
      throw new Error('Unauthorized');
    }

    return response;
  } catch (error) {
    console.error(`API Fetch Error [${endpoint}]:`, error);
    throw error;
  }
}
