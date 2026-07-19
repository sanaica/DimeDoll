/**
 * Shared API configuration.
 * Uses Vite env var VITE_API_URL in production, falls back to localhost for dev.
 */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
