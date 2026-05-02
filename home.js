const NEWS_ITEMS_STORAGE_KEY = "newsItems";

function readNewsItems() {
  try {
    const raw = window.localStorage.getItem(NEWS_ITEMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stripHtmlToText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html || "");
  return tmp.textContent?.trim() || "";
}

function getCurrentUserName() {
  try {
    const explicitName = (window.localStorage.getItem("currentUserName") || "").trim();
    if (explicitName) return explicitName;

    const selectedEmployeeRaw = window.sessionStorage.getItem("selectedEmployee");
    if (selectedEmployeeRaw) {
      const selectedEmployee = JSON.parse(selectedEmployeeRaw);
      const first = (selectedEmployee?.voornaam || "").trim();
      const last = (selectedEmployee?.achternaam || "").trim();
      const full = `${first} ${last}`.trim();
      if (full) return full;
      if (first) return first;
    }
  } catch {
    // Ignore storage parse errors.
  }
  return "Jason";
}

function parseNlDateTime(str) {
  if (!str) return 0;
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(String(str).trim());
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}

function getVisibleNewsItems() {
  return readNewsItems()
    .filter((item) => item && item.archived !== true && item.status !== "Draft")
    .sort((a, b) => parseNlDateTime(b.aanmaakdatum) - parseNlDateTime(a.aanmaakdatum));
}

function createCard(item, onOpen) {
  const card = document.createElement("article");
  card.className = "home-news-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Open nieuwsbericht ${item.titel || ""}`);

  if (item.image) {
    const img = document.createElement("img");
    img.className = "home-news-card-image";
    img.src = item.image;
    img.alt = item.titel || "Nieuwsafbeelding";
    card.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "home-news-card-image home-news-card-image--fallback";
    fallback.textContent = "Nieuws";
    card.appendChild(fallback);
  }

  const body = document.createElement("div");
  body.className = "home-news-card-body";

  const title = document.createElement("h3");
  title.className = "home-news-card-title";
  title.textContent = item.titel || "Nieuwsbericht";

  const preview = document.createElement("p");
  preview.className = "home-news-card-preview";
  preview.textContent = stripHtmlToText(item.inhoud).slice(0, 120) || "Klik om het volledige bericht te openen.";

  const meta = document.createElement("div");
  meta.className = "home-news-card-meta";
  meta.textContent = `${item.auteur || "HR team"}${item.aanmaakdatum ? ` • ${item.aanmaakdatum}` : ""}`;

  body.append(title, preview, meta);
  card.appendChild(body);

  card.addEventListener("click", () => onOpen(item));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(item);
    }
  });

  return card;
}

function initNewsModal() {
  const modal = document.getElementById("home-news-modal");
  const closeBtn = document.getElementById("home-news-modal-close");
  const title = document.getElementById("home-news-modal-title");
  const author = document.getElementById("home-news-modal-author");
  const date = document.getElementById("home-news-modal-date");
  const content = document.getElementById("home-news-modal-content");
  const image = document.getElementById("home-news-modal-image");
  if (!modal || !title || !author || !date || !content || !image) return { open() {} };

  function open(item) {
    title.textContent = item.titel || "Nieuwsbericht";
    author.textContent = item.auteur || "HR team";
    date.textContent = item.aanmaakdatum || "";
    content.innerHTML = item.inhoud?.trim() || "<p>Geen inhoud beschikbaar.</p>";
    if (item.image) {
      image.src = item.image;
      image.hidden = false;
    } else {
      image.src = "";
      image.hidden = true;
    }

    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function close() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
  }

  closeBtn?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hasAttribute("hidden")) {
      close();
      event.preventDefault();
    }
  });

  return { open };
}

function renderHomeNews() {
  const grid = document.getElementById("home-news-grid");
  const greeting = document.getElementById("home-greeting");
  if (!grid) return;

  if (greeting) {
    greeting.textContent = `Welkom, ${getCurrentUserName()}`;
  }

  const modal = initNewsModal();
  const items = getVisibleNewsItems();
  grid.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "home-news-empty";
    empty.textContent = "Er zijn nog geen nieuwsberichten. Voeg een bericht toe via HR > Nieuws.";
    grid.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    grid.appendChild(createCard(item, modal.open));
  });
}

renderHomeNews();
