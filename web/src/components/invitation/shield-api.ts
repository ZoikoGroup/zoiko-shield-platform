export const shieldApiUrl =
  process.env.NEXT_PUBLIC_SHIELD_API_URL ?? "http://localhost:3001";

export async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      message?: string | string[];
      error?: string;
    };
    if (Array.isArray(payload.message)) return payload.message.join(". ");
    return (
      payload.message ?? payload.error ?? `Request failed (${response.status})`
    );
  } catch {
    return `Request failed (${response.status})`;
  }
}
