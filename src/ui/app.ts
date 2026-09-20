import "./styles.css";
import { renderBracketedExpression } from "./bracket-renderer";
import { RealProofEngine, REAL_THEOREM_LIST, TACTICS, type DisplayProofState, type ProofStateView } from "./proof-engine";
import { NATURAL_NUMBERS_LESSON, initialLessonProgress, initialTheoremState, isCompleted, nextExercise, recordProofResult, type Exercise } from "./tutorial";
import { renderKVCacheLab } from "./kv-cache-lab";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("UI root element #app was not found");
const root = app;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function renderKVRoute(): void {
  renderKVCacheLab(root);
}

function renderProofCourse(): void {
  const engine = new RealProofEngine();
  let currentExerciseId = NATURAL_NUMBERS_LESSON.exercises[0].id;
  let state: ProofStateView | null = initialTheoremState(NATURAL_NUMBERS_LESSON.exercises[0], (id) => engine.loadTheorem(id));
  let progress = initialLessonProgress();
  let statusMessage = "Real Proof Engine";
  let statusKind: "neutral" | "success" | "error" = "neutral";
  let tacticInputValue = "";

  function currentExercise(): Exercise {
    return NATURAL_NUMBERS_LESSON.exercises.find((exercise) => exercise.id === currentExerciseId) ?? NATURAL_NUMBERS_LESSON.exercises[0];
  }

  function currentChapter() {
    return NATURAL_NUMBERS_LESSON.chapters.find((chapter) => chapter.exerciseIds.includes(currentExerciseId)) ?? NATURAL_NUMBERS_LESSON.chapters[0];
  }

  function renderContext(context: ProofStateView["goals"][number]["context"]): string {
    return context.length ? context.map((entry) => `<div class="context-row"><code>${escapeHtml(entry.name)}</code><span>:</span><code class="proof-expression">${renderBracketedExpression(entry.type)}</code></div>`).join("") : `<p class="muted">No local assumptions.</p>`;
  }

  function renderProofState(display: DisplayProofState): string {
    return `<section class="card proof-state-card"><div class="card-title">Props / Context</div><div class="context-list">${renderContext(display.props)}</div></section><section class="card goal-card"><div class="card-title">Goal</div><pre class="goal-expression proof-expression">${renderBracketedExpression(display.goal)}</pre></section>`;
  }

  function renderTacticHistory(history: readonly string[]): string {
    return `<section class="card tactic-history"><div class="card-title">Tactic History</div>${history.length ? `<ol>${history.map((tactic) => `<li><code>${escapeHtml(tactic)}</code></li>`).join("")}</ol>` : `<p class="muted">No tactics applied yet.</p>`}</section>`;
  }

  function renderTactics(): string {
    const suggestions = engine.tacticSuggestions();
    const available = suggestions.filter((tactic) => tactic.id !== "exact" && tactic.id !== "apply");
    const otherIds = ["exact", "apply", "rewrite", "induction"];
    const other = otherIds.map((id) => TACTICS.find((tactic) => tactic.id === id)).filter((tactic): tactic is NonNullable<typeof tactic> => !!tactic);
    const theoremItems = REAL_THEOREM_LIST.map((theorem) => `<button class="tactic-other-item theorem-item" type="button" data-theorem="${theorem.id}" title="Use theorem ${theorem.id}"><code>${theorem.label}</code><span>Use</span></button>`).join("");
    return `<aside class="tactic-panel" aria-label="Proof tools"><div class="card-title">Available Tactics</div><div class="tactic-suggestions">${available.length ? available.map((tactic) => `<button class="tactic-suggestion" type="button" data-tactic="${tactic.syntax}" title="${tactic.description}"><code>${tactic.syntax.trim()}</code><span>${tactic.description}</span></button>`).join("") : `<p class="muted">No automatic suggestions.</p>`}</div><div class="tactic-other"><div class="card-title">Other Tactics</div>${other.map((tactic) => `<button class="tactic-other-item" type="button" data-tactic="${tactic.syntax}" title="${tactic.description}"><code>${tactic.label}</code></button>`).join("")}</div><div class="tactic-other theorem-panel"><div class="card-title">Theorems</div><div class="theorem-list">${theoremItems}</div></div></aside>`;
  }

  function selectExercise(exercise: Exercise): void {
    currentExerciseId = exercise.id;
    state = initialTheoremState(exercise, (id) => engine.loadTheorem(id));
    tacticInputValue = "";
    statusKind = "neutral";
    statusMessage = "Real Proof Engine";
    render();
    const input = root.querySelector<HTMLInputElement>("#tactic-input");
    if (input) { input.focus(); input.select(); }
  }

  function renderGoals(): string {
    if (!state) return `<div class="unavailable-state"><strong>Unavailable</strong><span>${currentExercise().availabilityNote ?? "This exercise is not currently executable."}</span></div>`;
    if (state.completed) return `<div class="completed-state"><strong>Proof accepted</strong><span>Accepted by the real Kernel.</span></div>`;
    return state.goals.map((goal, index) => `<article class="goal-item ${index === 0 ? "focused" : ""}"><div class="goal-heading"><span>Goal ${index + 1}</span>${index === 0 ? "<span>focused</span>" : ""}</div><pre class="goal-expression proof-expression">${renderBracketedExpression(goal.target)}</pre><div class="goal-context">${renderContext(goal.context)}</div></article>`).join("");
  }

  function render(): void {
    const exercise = currentExercise();
    const chapter = currentChapter();
    const next = nextExercise(NATURAL_NUMBERS_LESSON, exercise.id);
    const courseComplete = NATURAL_NUMBERS_LESSON.exercises.every((item) => isCompleted(progress, item.id));
    root.innerHTML = `<div class="app-shell">
      <header class="topbar"><div><div class="brand">Prover</div><div class="tagline">Curry–Howard Interactive Proofs</div></div><div class="topbar-links"><a class="github-link" href="#kv-cache">KV Cache Lab</a><span class="mode-badge">Real Proof Engine</span></div></header>
      <main class="workspace">
        <aside class="sidebar" aria-label="Chapter and exercise navigator">
          <div class="section-label">Course</div><h2>${NATURAL_NUMBERS_LESSON.title}</h2>
          ${NATURAL_NUMBERS_LESSON.chapters.map((item) => `<section class="chapter"><div class="chapter-title">Chapter ${item.number} · ${item.title}</div>${item.exerciseIds.map((id) => { const itemEx = NATURAL_NUMBERS_LESSON.exercises.find((x) => x.id === id)!; return `<button class="theorem-item ${exercise.id === id ? "active" : ""} ${isCompleted(progress, id) ? "completed" : ""}" data-exercise="${id}" type="button"><span class="status">${isCompleted(progress, id) ? "✓" : itemEx.number}</span><span>${itemEx.title}</span></button>`; }).join("")}</section>`).join("")}
        </aside>
        <section class="proof-panel">
          <div class="theorem-header"><div><div class="section-label">Chapter ${chapter.number} · Exercise ${exercise.number}</div><h1>${exercise.title}</h1><p class="theorem-statement"><code>${exercise.statement}</code></p></div></div>
          <section class="card"><div class="card-title">Prerequisites</div><div>${exercise.prerequisiteIds.length ? exercise.prerequisiteIds.join(" → ") : "None"}</div></section>
          <section class="card"><div class="card-title">Suggested path</div><code>${exercise.tacticHint}</code></section>
          ${state && !state.completed && state.goals[0] ? `<div class="proof-layout"><div class="proof-main">${renderProofState(engine.displayProofState()!)}${renderTacticHistory(engine.tacticHistory())}<section class="card tactic-card"><div class="card-title">Tactic</div><input id="tactic-input" class="tactic-input" type="text" value="${escapeHtml(tacticInputValue)}" aria-invalid="${statusKind === "error" ? "true" : "false"}" aria-describedby="tactic-feedback" placeholder="intro, rfl, assumption, exact, apply, rewrite h, induction n" autocomplete="off"/>${statusKind === "error" ? `<div id="tactic-feedback" class="tactic-feedback" role="alert">${escapeHtml(statusMessage.replace(/^Proof rejected:\s*/, ""))}</div>` : ""}<button id="apply-button" class="apply-button" type="button">Apply</button></section></div>${renderTactics()}</div>` : state?.completed ? `<div class="completed-state"><strong>Proof accepted</strong><span>Accepted by the real Kernel.</span></div>` : `<section class="card unavailable-state"><strong>Unavailable</strong><span>${exercise.availabilityNote}</span></section>`}
          <section class="proof-state" aria-live="polite"><div><div class="card-title">Proof State</div><pre class="state-message ${statusKind}">${statusMessage}</pre></div><span class="goal-count">${state?.goals.length ?? 0} ${state?.goals.length === 1 ? "goal" : "goals"}</span></section>
          <section class="goals-list" aria-label="Proof goals">${renderGoals()}</section>
          ${state?.completed && next ? `<button id="next-button" class="next-button" type="button">Next exercise →</button>` : courseComplete ? `<div class="completed-state"><strong>Course complete</strong><span>All ten exercises have Kernel-backed accepted proofs.</span></div>` : ""}
        </section>
      </main></div>`;

    root.querySelectorAll<HTMLButtonElement>("[data-exercise]").forEach((button) => button.addEventListener("click", () => { const selected = NATURAL_NUMBERS_LESSON.exercises.find((item) => item.id === button.dataset.exercise); if (selected) selectExercise(selected); }));
    root.querySelector<HTMLButtonElement>("#next-button")?.addEventListener("click", () => { if (next) selectExercise(next); });
    const input = root.querySelector<HTMLInputElement>("#tactic-input");
    const apply = root.querySelector<HTMLButtonElement>("#apply-button");
    const applyTactic = () => {
      if (!input || !state) return;
      tacticInputValue = input.value;
      const result = engine.runTactic(tacticInputValue);
      state = result.state;
      statusKind = result.kind;
      statusMessage = result.kind === "success" ? (result.message ?? "Proof state updated") : `Proof rejected: ${result.message}`;
      if (result.kind === "success") { progress = recordProofResult(progress, exercise, result); tacticInputValue = ""; }
      render();
      root.querySelector<HTMLInputElement>("#tactic-input")?.focus();
    };
    apply?.addEventListener("click", applyTactic);
    root.querySelectorAll<HTMLButtonElement>("[data-tactic]").forEach((button) => button.addEventListener("click", () => {
      const syntax = button.dataset.tactic ?? "";
      if (syntax.endsWith(" ")) { if (input) { input.value = syntax; tacticInputValue = syntax; input.focus(); } }
      else { if (input) { input.value = syntax; tacticInputValue = syntax; } applyTactic(); }
    }));
    root.querySelectorAll<HTMLButtonElement>("[data-theorem]").forEach((button) => button.addEventListener("click", () => {
      if (!input) return;
      input.value = `exact ${button.dataset.theorem ?? ""}`;
      tacticInputValue = input.value;
      input.focus();
    }));
    input?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.isComposing) applyTactic(); });
  }

  render();
}

function renderRoute(): void {
  if (location.hash === "#kv-cache") renderKVRoute();
  else renderProofCourse();
}

window.addEventListener("hashchange", renderRoute);
renderRoute();
