const form = document.querySelector("#like-form");
const input = document.querySelector("#like-input");
const list = document.querySelector("#likes-list");
const bird = document.querySelector(".bird");
const birdButton = document.querySelector(".bird-button");

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
