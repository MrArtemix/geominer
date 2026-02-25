import axios from 'axios';
import { getSession } from 'next-auth/react';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor: attach JWT from NextAuth session
api.interceptors.request.use(
  async (config) => {
    // Only attach token on client-side requests
    if (typeof window !== 'undefined') {
      const session = await getSession();
      if (session?.accessToken) {
        config.headers.Authorization = `Bearer ${session.accessToken}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: handle 401 by redirecting to login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Clear session and redirect to login
      const currentPath = window.location.pathname;
      window.location.href = `/login?callbackUrl=${encodeURIComponent(currentPath)}`;
    }
    return Promise.reject(error);
  }
);

export default api;
