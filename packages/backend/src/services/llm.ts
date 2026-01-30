/**
 * LLM client for 硅基流动 (SiliconFlow) API. Uses SILICONFLOW_BASE_URL + API_KEY from env.
 */
const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_MODEL = "Qwen/Qwen3-8B";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(messages: ChatMessage[], options?: { model?: string }): Promise<string> {
  const baseUrl = (process.env.SILICONFLOW_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY is required for LLM calls");

  const url = `${baseUrl}/chat/completions`;
  const model = options?.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  return content;
}
