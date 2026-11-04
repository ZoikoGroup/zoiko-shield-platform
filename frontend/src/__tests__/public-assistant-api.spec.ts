import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createMessage,
  streamMessage,
} from "@/components/public-assistant/api";

function sseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map((item) => `event: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`)
    .join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

describe("public assistant API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends an anonymous client message id and the selected market", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message_id: "msg_1",
          status: "PENDING",
          outcome: "PENDING",
          created_at: "2026-10-30T00:00:00.000Z",
        }),
        { status: 202, headers: { "content-type": "application/json" } },
      ),
    );

    await createMessage({ content: "What is ZoikoShield?", market: "eu" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/public/chat/v1/messages");
    const body = JSON.parse(String(init?.body));
    expect(body.content).toBe("What is ZoikoShield?");
    expect(body.market).toBe("eu");
    expect(body.client_message_id).toEqual(expect.any(String));
    expect(body.client_message_id.length).toBeGreaterThan(8);
  });

  it("parses the SSE replay and returns the final answer with citations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        { event: "acknowledged", data: { message_id: "msg_1" } },
        { event: "progress", data: { stage: "retrieving" } },
        {
          event: "final",
          data: {
            message_id: "msg_1",
            outcome: "ANSWERED",
            blocks: [{ type: "paragraph", text: "Approved public answer." }],
            citations: [
              { source_id: "cap-overview", title: "Overview", url: "/help", kind: "CAPABILITY" },
            ],
            follow_up_chips: ["How does detection work?"],
          },
        },
      ]),
    );

    const seen: string[] = [];
    const final = await streamMessage("msg_1", {
      onEvent: (event) => seen.push(event.type),
    });

    expect(seen).toEqual(["acknowledged", "progress", "final"]);
    expect(final.outcome).toBe("ANSWERED");
    expect(final.blocks[0].text).toBe("Approved public answer.");
    expect(final.citations[0].source_id).toBe("cap-overview");
  });

  it("turns a stream error event into a user-safe ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        {
          event: "error",
          data: {
            error_code: "CANCELLED",
            user_safe_message: "The message was cancelled.",
          },
        },
      ]),
    );

    const error = await streamMessage("msg_2").catch((caught) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: "CANCELLED",
      message: "The message was cancelled.",
    });
  });

  it("does not fabricate a 200 when the proxy is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      createMessage({ content: "What is ZoikoShield?" }),
    ).rejects.toMatchObject({
      status: 503,
      code: "ASSISTANT_UNAVAILABLE",
    });
  });
});
