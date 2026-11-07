import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  GetChatSystemPromptResponse,
  PostChatBody,
  PostChatResponse,
  type ApiError,
} from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import {
  CITY_GUIDE_SYSTEM_PROMPT,
  DEFAULT_CHAT_SETTINGS,
  DEFAULT_GEMINI_MODEL,
} from "../city";

const router: IRouter = Router();

function errorPayload(error: string): ApiError {
  return { error };
}

function getProviderStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = "status" in error ? error.status : undefined;
  if (typeof status === "number") return status;
  const code = "code" in error ? error.code : undefined;
  return typeof code === "number" ? code : undefined;
}

router.get("/chat/system-prompt", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(
    GetChatSystemPromptResponse.parse({
      systemPrompt: CITY_GUIDE_SYSTEM_PROMPT,
    }),
  );
});

router.post("/chat", async (req, res): Promise<void> => {
  const parsed = PostChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(errorPayload("Invalid chat request."));
    return;
  }

  const message = parsed.data.message.trim();
  if (!message) {
    res.status(400).json(errorPayload("Enter a question first."));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    res.status(503).json(errorPayload("Add a GEMINI_API_KEY secret"));
    return;
  }

  const settings = parsed.data.settings ?? DEFAULT_CHAT_SETTINGS;
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const history = parsed.data.history ?? [];
    const contents = [...history, { role: "user" as const, content: message }].map(
      (entry) => ({
        role: entry.role === "assistant" ? "model" : "user",
        parts: [{ text: entry.content }],
      }),
    );

    const request = {
      model,
      contents,
      config: {
        systemInstruction: CITY_GUIDE_SYSTEM_PROMPT,
        temperature: settings.temperature,
        topP: settings.topP,
        maxOutputTokens: settings.maxOutputTokens,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      },
    };

    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    try {
      response = await ai.models.generateContent(request);
    } catch (error) {
      const providerStatus = getProviderStatus(error);
      if (providerStatus !== 429 && providerStatus !== 500 && providerStatus !== 503) {
        throw error;
      }

      req.log.warn(
        { model, providerStatus },
        "Gemini temporarily unavailable; retrying once",
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      response = await ai.models.generateContent(request);
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    const normalizedFinishReason = finishReason
      ? String(finishReason)
      : null;
    const candidateTokenCount =
      response.usageMetadata?.candidatesTokenCount ?? null;
    const truncated =
      normalizedFinishReason === "MAX_TOKENS" ||
      (candidateTokenCount !== null &&
        candidateTokenCount >= settings.maxOutputTokens);
    const generatedReply = response.text?.trim() ?? "";
    const reply =
      generatedReply ||
      (truncated
        ? "I ran out of room before I could finish that Pittsburgh note."
        : "");
    if (!reply) {
      req.log.warn({ model }, "Gemini returned an empty city-guide response");
      res
        .status(502)
        .json(
          errorPayload(
            "The city guide couldn't answer right now. Please try again.",
          ),
        );
      return;
    }

    const usage = {
      promptTokenCount: response.usageMetadata?.promptTokenCount ?? null,
      candidatesTokenCount: candidateTokenCount,
      totalTokenCount: response.usageMetadata?.totalTokenCount ?? null,
      finishReason: normalizedFinishReason,
      truncated,
    };

    res.json(
      PostChatResponse.parse({
        reply,
        usage,
        settings,
        model,
      }),
    );
  } catch (error) {
    const providerStatus = getProviderStatus(error);
    req.log.error(
      {
        model,
        errorType: error instanceof Error ? error.name : "UnknownError",
        providerStatus,
      },
      "Gemini city-guide request failed",
    );
    const errorMessage =
      providerStatus === 401 || providerStatus === 403
        ? "Gemini rejected the API key or its permissions. Check the GEMINI_API_KEY secret and Gemini API access."
        : "The city guide couldn't answer right now. Please try again.";
    res
      .status(502)
      .json(errorPayload(errorMessage));
  }
});

export default router;
