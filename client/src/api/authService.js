import { apiClient } from './apiClient';

export const authService = {
  register(userData) {
    return apiClient('/auth/register', { body: userData });
  },

  login(credentials) {
    return apiClient('/auth/login', { body: credentials });
  },

  getCurrentUser() {
    return apiClient('/auth/me');
  },
};

export default authService;