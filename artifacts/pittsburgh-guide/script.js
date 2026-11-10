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
const dishUploadForm = document.querySelector("#dish-upload-form");
const dishTitleInput = document.querySelector("#dish-title");
const dishCaptionInput = document.querySelector("#dish-caption");
const dishImageInput = document.querySelector("#dish-image");
const dishFileName = document.querySelector("#dish-file-name");
const dishUploadButton = document.querySelector("#dish-upload-button");
const dishUploadStatus = document.querySelector("#dish-upload-status");
const dishGallery = document.querySelector("#dish-gallery-grid");
const dishGalleryStatus = document.querySelector("#dish-gallery-status");
const dishGalleryEmpty = document.querySelector("#dish-gallery-empty");
const dishGalleryCount = document.querySelector("#dish-gallery-count");

const conversation = [];
let isSending = false;
let dishPhotos = [];
let isUploadingDish = false;

const MAX_DISH_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_DISH_IMAGE_EDGE = 1280;
const SUPPORTED_DISH_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

function formatDishDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "JUST SHARED";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
    .format(date)
    .toUpperCase();
}

function sortDishPhotos(photos) {
  return [...photos].sort((first, second) => {
    const dateDifference =
      new Date(second.createdAt).getTime() -
      new Date(first.createdAt).getTime();
    return dateDifference || second.id - first.id;
  });
}

function createDishPhotoCard(photo) {
  const card = document.createElement("article");
  card.className = "dish-photo-card";

  const image = document.createElement("img");
  image.src = photo.imageUrl;
  image.alt = `Photo of ${photo.title}, shared in the Pittsburgh food gallery`;
  image.loading = "lazy";
  image.decoding = "async";

  const copy = document.createElement("div");
  copy.className = "dish-photo-copy";

  const title = document.createElement("h3");
  title.textContent = photo.title;
  copy.append(title);

  if (photo.caption) {
    const caption = document.createElement("p");
    caption.textContent = photo.caption;
    copy.append(caption);
  }

  const date = document.createElement("time");
  date.dateTime = new Date(photo.createdAt).toISOString();
  date.textContent = formatDishDate(photo.createdAt);
  copy.append(date);

  card.append(image, copy);
  return card;
}

function renderDishPhotos() {
  dishGallery.replaceChildren(...dishPhotos.map(createDishPhotoCard));
  dishGalleryCount.textContent = `${dishPhotos.length} ${
    dishPhotos.length === 1 ? "PHOTO" : "PHOTOS"
  }`;
  dishGalleryEmpty.hidden = dishPhotos.length > 0;
}

async function loadDishPhotos() {
  dishGalleryStatus.textContent = "Loading the photo roll…";
  try {
    const response = await fetch("/api/dishes");
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "The photo roll could not be loaded.");
    }
    if (!Array.isArray(data)) {
      throw new Error("The photo roll returned an unexpected response.");
    }

    // Keep a photo uploaded while this initial request was still in flight.
    const byId = new Map(data.map((photo) => [photo.id, photo]));
    dishPhotos.forEach((photo) => byId.set(photo.id, photo));
    dishPhotos = sortDishPhotos([...byId.values()]);
    renderDishPhotos();
    dishGalleryStatus.textContent = "";
  } catch (error) {
    dishGalleryStatus.textContent =
      error.message || "The photo roll could not be loaded. Please refresh.";
    dishGalleryEmpty.hidden = true;
  }
}

function canvasToBlob(canvas, mimeType) {
  return new Promise((resolve, reject) => {
    const quality =
      mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.88 : undefined;
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The photo could not be resized in this browser."));
      },
      mimeType,
      quality,
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The resized photo could not be read."));
    };
    reader.onerror = () =>
      reject(new Error("The resized photo could not be read."));
    reader.readAsDataURL(blob);
  });
}

async function resizeDishPhoto(file) {
  if (!SUPPORTED_DISH_IMAGE_TYPES.has(file.type)) {
    throw new Error("Please choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size > MAX_DISH_IMAGE_BYTES) {
    throw new Error("This photo is over 3 MB. Choose a smaller file.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This file could not be opened as an image.");
  }

  const scale = Math.min(
    1,
    MAX_DISH_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("This browser could not prepare the photo for upload.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const resizedBlob = await canvasToBlob(canvas, file.type);
  if (resizedBlob.size > MAX_DISH_IMAGE_BYTES) {
    throw new Error(
      "The resized photo is still over 3 MB. Choose a smaller image.",
    );
  }
  return blobToDataUrl(resizedBlob);
}

dishImageInput.addEventListener("change", () => {
  const file = dishImageInput.files[0];
  dishFileName.textContent = file
    ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`
    : "JPEG, PNG, or WebP · up to 3 MB";
  dishUploadStatus.textContent = "";
  dishUploadStatus.className = "dish-upload-status";
});

dishUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isUploadingDish) return;

  const title = dishTitleInput.value.trim();
  const file = dishImageInput.files[0];
  if (!title) {
    dishUploadStatus.textContent = "Add a title for your dish photo.";
    dishTitleInput.focus();
    return;
  }
  if (!file) {
    dishUploadStatus.textContent = "Choose a JPEG, PNG, or WebP photo first.";
    dishImageInput.focus();
    return;
  }

  isUploadingDish = true;
  dishUploadButton.disabled = true;
  dishUploadButton.querySelector("span:first-child").textContent =
    "Preparing photo…";
  dishUploadStatus.textContent = "";
  dishUploadStatus.className = "dish-upload-status";

  try {
    const image = await resizeDishPhoto(file);
    dishUploadButton.querySelector("span:first-child").textContent =
      "Uploading…";
    const response = await fetch("/api/dishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        caption: dishCaptionInput.value.trim(),
        image,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || "The photo could not be uploaded.");
    }
    if (
      !data ||
      typeof data.id !== "number" ||
      typeof data.imageUrl !== "string"
    ) {
      throw new Error("The gallery returned an unexpected response.");
    }

    dishPhotos = sortDishPhotos([
      data,
      ...dishPhotos.filter((photo) => photo.id !== data.id),
    ]);
    renderDishPhotos();
    dishGalleryStatus.textContent = "";
    dishUploadForm.reset();
    dishFileName.textContent = "JPEG, PNG, or WebP · up to 3 MB";
    dishUploadStatus.textContent = "Your photo is now at the top of the roll.";
    dishUploadStatus.className = "dish-upload-status success";
  } catch (error) {
    dishUploadStatus.textContent =
      error.message || "The photo could not be uploaded. Please try again.";
    dishUploadStatus.className = "dish-upload-status";
  } finally {
    isUploadingDish = false;
    dishUploadButton.disabled = false;
    dishUploadButton.querySelector("span:first-child").textContent =
      "Share your plate";
  }
});

loadDishPhotos();
