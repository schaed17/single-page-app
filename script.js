// TV Show Picker
// API 1: TVMaze (show search, details, cast)  https://www.tvmaze.com/api
// API 2: Open Trivia DB (Television trivia)  https://opentdb.com/api_config.php

const TVMAZE = "https://api.tvmaze.com";
const TRIVIA_URL = "https://opentdb.com/api.php?amount=5&category=14&type=multiple&encode=url3986";
const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><rect width="200" height="300" fill="#b6c8cf"/><text x="100" y="160" font-family="system-ui, sans-serif" font-size="22" text-anchor="middle" fill="#536b75">No image</text></svg>'
);

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const surpriseBtn = document.querySelector("#surprise-btn");
const statusEl = document.querySelector("#status");
const resultsSection = document.querySelector("#results-section");
const resultsList = document.querySelector("#results");
const detail = document.querySelector("#detail");

// Fetch JSON and throw on HTTP errors so callers can show a message
async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

// TVMaze summaries contain HTML tags; turn them into plain text safely
function stripTags(html) {
  if (!html) return "No summary available.";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent.trim();
}

function setStatus(message) {
  statusEl.textContent = message;
}

/* ---------- Search ---------- */

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;

  setStatus(`Searching for "${query}"...`);
  detail.hidden = true;

  try {
    const results = await getJSON(`${TVMAZE}/search/shows?q=${encodeURIComponent(query)}`);
    if (results.length === 0) {
      resultsSection.hidden = true;
      setStatus(`No shows found for "${query}".`);
      return;
    }
    renderResults(results.map((result) => result.show));
    setStatus(`${results.length} show${results.length === 1 ? "" : "s"} found. Select one to see details.`);
  } catch (error) {
    setStatus(`Something went wrong: ${error.message}. Please try again.`);
  }
});

function renderResults(shows) {
  resultsList.innerHTML = "";

  shows.forEach((show) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";

    const img = document.createElement("img");
    img.src = show.image ? show.image.medium : PLACEHOLDER;
    img.alt = `Poster for ${show.name}`;
    img.loading = "lazy";

    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = show.name;

    const year = document.createElement("span");
    year.className = "card-year";
    year.textContent = show.premiered ? show.premiered.slice(0, 4) : "Year unknown";

    button.append(img, title, year);
    button.addEventListener("click", () => loadShow(show.id));
    item.append(button);
    resultsList.append(item);
  });

  resultsSection.hidden = false;
}

/* ---------- Show details ---------- */

async function loadShow(id) {
  setStatus("Loading show...");
  try {
    const show = await getJSON(`${TVMAZE}/shows/${id}?embed=cast`);
    renderDetail(show);
    setStatus("");
  } catch (error) {
    setStatus(`Couldn't load that show: ${error.message}.`);
  }
}

function renderDetail(show) {
  const year = show.premiered ? show.premiered.slice(0, 4) : "";
  document.querySelector("#detail-img").src = show.image ? show.image.original : PLACEHOLDER;
  document.querySelector("#detail-img").alt = `Poster for ${show.name}`;
  document.querySelector("#detail-title").textContent = show.name;
  document.querySelector("#detail-meta").textContent = [year, show.language, ...show.genres].filter(Boolean).join(" · ");
  document.querySelector("#detail-summary").textContent = stripTags(show.summary);
  document.querySelector("#detail-rating").textContent = show.rating.average ? `${show.rating.average} / 10` : "Not rated";
  const network = show.network || show.webChannel;
  document.querySelector("#detail-network").textContent = network ? network.name : "Unknown";
  document.querySelector("#detail-premiered").textContent = show.premiered || "Unknown";
  document.querySelector("#detail-status").textContent = show.status;

  const castList = document.querySelector("#detail-cast");
  castList.innerHTML = "";
  const cast = show._embedded && show._embedded.cast ? show._embedded.cast.slice(0, 8) : [];

  if (cast.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Cast not listed.";
    castList.append(empty);
  }

  cast.forEach(({ person, character }) => {
    const item = document.createElement("li");
    const img = document.createElement("img");
    img.src = person.image ? person.image.medium : PLACEHOLDER;
    img.alt = `Photo of ${person.name}`;
    img.loading = "lazy";
    const name = document.createElement("strong");
    name.textContent = person.name;
    const role = document.createElement("span");
    role.textContent = `as ${character.name}`;
    item.append(img, name, role);
    castList.append(item);
  });

  detail.hidden = false;
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Surprise me: random show from TVMaze ---------- */

surpriseBtn.addEventListener("click", async () => {
  setStatus("Picking a random show...");
  resultsSection.hidden = true;

  // TVMaze's index is paged in blocks of 250 shows; grab a random page,
  // then prefer shows that have a poster and a rating
  try {
    const page = Math.floor(Math.random() * 100);
    const shows = await getJSON(`${TVMAZE}/shows?page=${page}`);
    const good = shows.filter((show) => show.image && show.rating.average);
    const pool = good.length ? good : shows;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await loadShow(pick.id);
  } catch (error) {
    setStatus(`Something went wrong: ${error.message}. Please try again.`);
  }
});

/* ---------- Trivia ---------- */

const triviaBtn = document.querySelector("#trivia-btn");
const triviaBox = document.querySelector("#trivia-box");
const triviaProgress = document.querySelector("#trivia-progress");
const triviaQuestion = document.querySelector("#trivia-question");
const triviaAnswers = document.querySelector("#trivia-answers");
const triviaFeedback = document.querySelector("#trivia-feedback");

let questions = [];
let current = 0;
let score = 0;

triviaBtn.addEventListener("click", startTrivia);

async function startTrivia() {
  triviaBtn.disabled = true;
  triviaBtn.textContent = "Loading...";
  triviaFeedback.textContent = "";

  try {
    const data = await getJSON(TRIVIA_URL);
    if (data.response_code !== 0) {
      throw new Error("trivia service is busy, wait a few seconds");
    }
    questions = data.results.map((q) => ({
      question: decodeURIComponent(q.question),
      correct: decodeURIComponent(q.correct_answer),
      answers: shuffle([q.correct_answer, ...q.incorrect_answers].map(decodeURIComponent))
    }));
    current = 0;
    score = 0;
    triviaBox.hidden = false;
    showQuestion();
  } catch (error) {
    triviaFeedback.textContent = "";
    triviaBox.hidden = false;
    triviaQuestion.textContent = `Couldn't load trivia: ${error.message}.`;
    triviaAnswers.innerHTML = "";
  } finally {
    triviaBtn.disabled = false;
    triviaBtn.textContent = "New round";
  }
}

function showQuestion() {
  const q = questions[current];
  triviaProgress.textContent = `Question ${current + 1} of ${questions.length} · Score ${score}`;
  triviaQuestion.textContent = q.question;
  triviaFeedback.textContent = "";
  triviaAnswers.innerHTML = "";

  q.answers.forEach((answer) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.textContent = answer;
    button.addEventListener("click", () => checkAnswer(button, answer));
    triviaAnswers.append(button);
  });
}

function checkAnswer(button, answer) {
  const q = questions[current];
  const buttons = triviaAnswers.querySelectorAll("button");
  buttons.forEach((b) => {
    b.disabled = true;
    if (b.textContent === q.correct) b.classList.add("is-correct");
  });

  if (answer === q.correct) {
    score++;
    triviaFeedback.textContent = "You got it!";
  } else {
    button.classList.add("is-wrong");
    triviaFeedback.textContent = `Nope. It was "${q.correct}".`;
  }

  setTimeout(() => {
    current++;
    if (current < questions.length) {
      showQuestion();
    } else {
      triviaProgress.textContent = "Final score";
      triviaQuestion.textContent = `You got ${score} of ${questions.length}. ${score >= 4 ? "Nice work!" : "Try another round!"}`;
      triviaAnswers.innerHTML = "";
      triviaFeedback.textContent = "";
    }
  }, 1400);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}