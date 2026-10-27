import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiResponsesProvider, validateTextRewrite } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI Responses adapter", () => {
  it("sends server-side structured output requests without provider storage", async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.store).toBe(false);
      expect(body.text.format.strict).toBe(true);
      expect(body).not.toHaveProperty("reasoning");
      return new Response(JSON.stringify({ id: "resp_test", model: "test", output: [{ type: "message", content: [{ type: "output_text", text: '{"text":"Improved copy"}' }] }], usage: { total_tokens: 12 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", request);
    const result = await new OpenAiResponsesProvider("secret", "https://api.example.test/v1").structured({ model: "gpt-4o-mini", instructions: "Improve", input: "Original", schemaName: "rewrite", schema: {}, validate: validateTextRewrite, reasoningEffort: "none" });
    expect(result.value.text).toBe("Improved copy");
    expect(result.usage.totalTokens).toBe(12);
  });

  it("sends reasoning effort only to reasoning-capable models", async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.reasoning).toEqual({ effort: "low" });
      return new Response(JSON.stringify({ id: "resp_reasoning", model: "gpt-5.6-luna", output: [{ type: "message", content: [{ type: "output_text", text: '{"text":"Improved copy"}' }] }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", request);
    await new OpenAiResponsesProvider("secret", "https://api.example.test/v1").structured({ model: "gpt-5.6-luna", instructions: "Improve", input: "Original", schemaName: "rewrite", schema: {}, validate: validateTextRewrite });
    expect(request).toHaveBeenCalledOnce();
  });

  it("sends approved source images as ordered visual inputs", async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.input).toEqual([{
        role: "user",
        content: [
          { type: "input_text", text: "Original" },
          { type: "input_image", image_url: "https://business.example/real-work.jpg", detail: "low" },
        ],
      }]);
      return new Response(JSON.stringify({ id: "resp_visual", model: "test", output: [{ type: "message", content: [{ type: "output_text", text: '{"text":"Improved copy"}' }] }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", request);
    await new OpenAiResponsesProvider("secret", "https://api.example.test/v1").structured({
      model: "test", instructions: "Improve", input: "Original", imageInputs: [{ url: "https://business.example/real-work.jpg" }], schemaName: "rewrite", schema: {}, validate: validateTextRewrite,
    });
    expect(request).toHaveBeenCalledOnce();
  });
});

describe("owner budget metering callback", () => {
  const structured = { model: "gpt-5.6-luna", instructions: "Rewrite", input: "Synthetic text", schemaName: "rewrite", schema: {}, validate: validateTextRewrite, maxOutputTokens: 8000 };
  it("records cost before schema validation, including invalid provider output", async () => {
    const onUsage = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body)).max_output_tokens).toBe(8000);
      return new Response(JSON.stringify({ model: "gpt-5.6-luna", usage: { input_tokens: 100, output_tokens: 20 }, output: [{ content: [{ type: "output_text", text: "malformed" }] }] }));
    }));
    await expect(new OpenAiResponsesProvider("synthetic").structured({ ...structured, onUsage })).rejects.toThrow(/malformed/);
    expect(onUsage).toHaveBeenCalledWith("gpt-5.6-luna", expect.objectContaining({ pricingKnown: true, estimatedCostUsdMicros: 44 }));
  });
  it("never settles missing usage as zero", async () => {
    const onUsage = vi.fn(async () => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: '{"text":"ok"}' }] }] }))));
    await new OpenAiResponsesProvider("synthetic").structured({ ...structured, onUsage }); expect(onUsage).not.toHaveBeenCalled();
  });
  it("fails closed when settlement persistence fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ usage: { input_tokens: 10, output_tokens: 5 }, output: [{ content: [{ type: "output_text", text: '{"text":"ok"}' }] }] }))));
    await expect(new OpenAiResponsesProvider("synthetic").structured({ ...structured, onUsage: async () => { throw new Error("settlement unavailable"); } })).rejects.toThrow("settlement unavailable");
  });
});
