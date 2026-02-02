import axios from "axios";
import { getApiBaseUrl } from "../utils/env";

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000
});

// Add interceptor for auth if needed
apiClient.interceptors.request.use((config) => {
  // Logic to attach token from storage
  return config;
});
