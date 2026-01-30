import { getApiUrl } from "./getApiUrl";

/** Trigger browser download of .docx for the given threadId. */
export function downloadDocx(threadId: string): void {
  const base = getApiUrl();
  const url = `${base}/api/download/${encodeURIComponent(threadId)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = `公文-${threadId.slice(0, 8)}.docx`;
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
