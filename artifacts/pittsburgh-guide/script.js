const form = document.querySelector("#like-form");
const input = document.querySelector("#like-input");
const list = document.querySelector("#likes-list");
const bird = document.querySelector(".bird");
const birdButton = document.querySelector(".bird-button");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatSubmit = document.querySelector("#chat-submit");
const chatMessages = document.querySelector("#chat-messages");
const chatEmpty = document.querySelector("#chat-empty");
const chatStatus = document.querySelector("#chat-status");
const systemPrompt = document.querySelector("#system-prompt");
const promptError = document.querySelector("#prompt-error");
const promptRetry = document.querySelector("#prompt-retry");
const temperatureInput = document.querySelector("#temperature");
const topPInput = document.querySelector("#top-p");
const maxTokensInput = document.querySelector("#max-output-tokens");
const temperatureValue = document.querySelector("#temperature-value");
const topPValue = document.querySelector("#top-p-value");
const maxTokensValue = document.querySelector("#max-output-tokens-value");

const conversation = [];
let isSending = false;

// Keep each favorite in this page only; a refresh starts the list over.
form.addEventListener("submit", (event) => {
  event.preventDefault();
  // Trim whitespace and ignore an empty submission.
  const favorite = input.value.trim();
  if (!favorite) {
    input.focus();
    return;
  }

  // Use textContent so the person's input is always treated as plain text.
  const item = document.createElement("li");
  item.textContent = favorite;
  list.append(item);
  input.value = "";
  input.focus();
});

let shakeTimer;
birdButton.addEventListener("click", () => {
  window.clearTimeout(shakeTimer);
  bird.classList.remove("shake");
  // Restart the animation even when the bird is clicked again quickly.
  void bird.offsetWidth;
  bird.classList.add("shake");
  shakeTimer = window.setTimeout(() => bird.classList.remove("shake"), 600);
});

function updateSubmitState() {
  chatSubmit.disabled = isSending || !chatInput.value.trim();
}

function appendMessage(role, content, metadata) {
  const article = document.createElement("article");
  article.className = `chat-message ${role}`;

  const label = document.createElement("span");
  label.className = "message-role";
  label.textContent = role === "user" ? "YOU / IN THE FIELD" : "CITY DESK / LOCAL GUIDE";

  const body = document.createElement("p");
  body.className = "message-body";
  body.textContent = content;
  article.append(label, body);

  if (role === "assistant" && metadata) {
    const meta = document.createElement("div");
    meta.className = "answer-meta";
    const settings = metadata.settings || {};
    const usage = metadata.usage || {};
    const detailItems = [
      `TEMP ${formatMetric(settings.temperature, "1.00")}`,
      `TOP P ${formatMetric(settings.topP ?? settings.top_p, "0.95")}`,
      `MAX ${formatMetric(settings.maxOutputTokens ?? settings.max_output_tokens, "300")}`,
      `TOKENS ${formatUsage(usage)}`,
    ];
    detailItems.forEach((detail) => {
      const item = document.createElement("span");
      item.textContent = detail;
      meta.append(item);
    });
    if (metadata.model) {
      const model = document.createElement("span");
      model.textContent = `MODEL ${metadata.model}`;
      meta.append(model);
    }
    article.append(meta);

    if (usage.truncated === true || usage.finishReason === "MAX_TOKENS") {
      const cutoff = document.createElement("p");
      cutoff.className = "cutoff-note";
      cutoff.textContent = "This answer reached its length limit and may be cut off. Ask a follow-up for the rest.";
      article.append(cutoff);
    }
  }

  chatMessages.append(article);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatMetric(value, fallback) {
  return value === undefined || value === null ? fallback : String(value);
}

function formatUsage(usage) {
  const total = usage.totalTokens ?? usage.totalTokenCount ?? usage.total_tokens;
  const input = usage.promptTokens ?? usage.promptTokenCount ?? usage.inputTokens ?? usage.prompt_tokens;
  const output = usage.completionTokens ?? usage.candidatesTokenCount ?? usage.outputTokens ?? usage.completion_tokens;
  if (total !== undefined) return `${total} TOTAL${input !== undefined || output !== undefined ? ` · ${input ?? "—"} IN / ${output ?? "—"} OUT` : ""}`;
  if (input !== undefined || output !== undefined) return `${input ?? "—"} IN / ${output ?? "—"} OUT`;
  return "NOT REPORTED";
}

function readSettings() {
  return {
    temperature: Number(temperatureInput.value),
    topP: Number(topPInput.value),
    maxOutputTokens: Number(maxTokensInput.value),
  };
}

function updateSettingLabels() {
  temperatureValue.textContent = Number(temperatureInput.value).toFixed(2);
  topPValue.textContent = Number(topPInput.value).toFixed(2);
  maxTokensValue.textContent = maxTokensInput.value;
}

async function loadSystemPrompt() {
  promptRetry.hidden = true;
  promptError.hidden = true;
  systemPrompt.textContent = "Fetching the guide’s field brief…";
  try {
    const response = await fetch("/api/chat/system-prompt");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The field brief could not be loaded.");
    systemPrompt.textContent = typeof data.systemPrompt === "string" ? data.systemPrompt : "No system prompt was returned.";
  } catch (error) {
    systemPrompt.textContent = "";
    promptError.textContent = error.message || "Could not reach the city desk. Check your connection and try again.";
    promptError.hidden = false;
    promptRetry.hidden = false;
  }
}

temperatureInput.addEventListener("input", updateSettingLabels);
topPInput.addEventListener("input", updateSettingLabels);
maxTokensInput.addEventListener("input", updateSettingLabels);
chatInput.addEventListener("input", updateSubmitState);

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.question || "";
    updateSubmitState();
    chatInput.focus();
  });
});

promptRetry.addEventListener("click", loadSystemPrompt);

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || isSending) return;

  if (chatEmpty) chatEmpty.hidden = true;
  appendMessage("user", message);
  chatInput.value = "";
  isSending = true;
  chatStatus.className = "chat-status loading";
  chatStatus.textContent = "The guide is checking the city notes…";
  updateSubmitState();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: conversation.slice(-12),
        settings: readSettings(),
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 503 || data.error === "Add a GEMINI_API_KEY secret") {
        throw new Error("The city desk is offline for now. Add a GEMINI_API_KEY secret to bring the guide online.");
      }
      throw new Error(data.error || "The guide couldn’t answer just now. Please try again.");
    }
    if (typeof data.reply !== "string") throw new Error("The city desk returned an unreadable answer. Please try again.");
    conversation.push({ role: "user", content: message }, { role: "assistant", content: data.reply });
    appendMessage("assistant", data.reply, data);
    chatStatus.textContent = "";
    chatStatus.className = "chat-status";
  } catch (error) {
    chatStatus.className = "chat-status";
    chatStatus.textContent = error.message || "Connection issue. Your question is still here—please try again.";
    chatInput.value = message;
  } finally {
    isSending = false;
    updateSubmitState();
    chatInput.focus();
  }
});

updateSettingLabels();
updateSubmitState();
loadSystemPrompt();
