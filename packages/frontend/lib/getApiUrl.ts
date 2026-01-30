/** Backend API base URL; use env in browser to support different deployments. */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";
}
