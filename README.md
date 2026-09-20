# prover-typescript

A small Curry–Howard proof-oriented TypeScript core with an explicit parser, elaborator, Kernel, environment, REPL, and incrementally built proof engine.

## Architecture

```text
Surface Syntax
      ↓
Parser
      ↓
Elaborator
      ↓
Core Term
      ↓
Kernel
```

The interactive proof path is kept outside the Kernel:

```text
Theorem
  ↓
Proof Engine
  ↓
Core Proof Term
  ↓
Kernel
```

The Kernel is the final trusted boundary. Parser, elaborator, environment, REPL, Proof State, tactics, metavariables, unification, and automation must not become Kernel dependencies.

## Milestone 16 — Proof State

Milestone 16 is complete. It introduces the smallest independent Proof State model needed for later tactics, without implementing tactics or metavariables.

The model is:

```text
ProofState
  ↓
Goals
  ↓
Context + Goal Type
```

`src/proof/state.ts` defines `ContextEntry`, `Context`, `Goal`, and `ProofState`, plus constructors for an initial state and immutable goal replacement. Context entries use names only as presentation metadata while their types remain existing Core `Term` values.

The M16 regression suite verifies:

- creation of a single Core-level goal with an empty context;
- contexts such as `A : Type` and `x : A`;
- multiple independent goals;
- goal replacement without mutating the original state;
- Proof State operations do not modify the Global Environment;
- invalid goal indexes are rejected.

M16 deliberately does not add:

```text
intro
exact
rfl
assumption
apply
metavariables
unification
implicit arguments
rewrite
automation
by syntax
```

No Kernel source was changed for M16. Proof State remains an untrusted proof-engine data model; any future generated proof must still become a Core Term and pass the Kernel.

## Verification

```text
npm run build -> success
npm test      -> 111 tests / 111 passed / 0 failed
```

The next planned milestone is M17 — Basic Tactics, but it is intentionally not started in this milestone.

## Milestone 17 — Basic Tactics

M17 is complete. The untrusted Proof Engine now provides `intro`, `exact`, `rfl`, `assumption`, and a deliberately bounded `apply` over the existing Proof State.

The tactic layer lives in `src/proof/tactic.ts`. It builds Core proof terms through a small internal proof skeleton; no metavariables or unification engine were introduced. Completed proofs are checked again through the existing Kernel API.

`apply` is intentionally limited to non-dependent Pi arguments. Dependent argument inference is deferred to M18/M19 rather than introducing metavariables early.

New regression coverage is in `tests/proof-tactic.test.ts` and covers success, failure, immutable state behavior, Kernel acceptance, and the M17 `apply` boundary.

M17 does not add `by` syntax, metavariables, unification, implicit arguments, rewrite, induction, or automation.

## Verification

```text
npm run build -> success
npx tsx --test "tests/**/*.test.ts" -> 131 tests / 131 passed / 0 failed
```

The next planned milestone is M18 — Metavariables.

## Milestone 18 — Metavariables

M18 is complete. The proof engine now has an immutable metavariable context in `src/proof/metavariable/meta.ts`.

The first implementation deliberately uses a separate `MetaTerm` wrapper:

```text
?m1
 ↓
assignment
 ↓
instantiate
 ↓
Core Term
 ↓
Kernel
```

Supported operations are:

- create a metavariable with an explicit local scope depth and optional Core type;
- assign it to a Core term or another metavariable;
- transitively resolve nested assignments;
- instantiate only when the result is a concrete Core `Term`;
- reject unassigned metavariables at the Core boundary;
- reject self-cycles and indirect cycles;
- reject assignments that escape the metavariable's local de Bruijn scope;
- keep failed assignments from mutating the original `MetaContext`.

M18 intentionally does **not** implement unification, occurs-check over arbitrary term structure, implicit arguments, or metavariables embedded inside Core syntax. Those remain later proof-engine work.

### Kernel boundary

The Kernel was not modified and has no dependency on `MetaContext`, `MetaVariable`, `MetaTerm`, or Proof State. A metavariable is never represented as a Core `Term`; `instantiate` must first resolve it to an actual Core term, which can then be checked by the existing Kernel.

### Verification

```text
npm run build -> success
npm test      -> 130 tests / 130 passed / 0 failed
```

M18 is complete. Stop here; do not begin M19 automatically.
## Post-M18 — Multi-Goal / Case / Proof UX

The Proof Engine now has a reliable multi-goal workflow without adding proof semantics to the Kernel.

`src/proof/state.ts` provides stable goal identity, explicit focus, navigation, immutable replacement, and optional case metadata. Goal identity and case names are Proof Engine/UI metadata only.

`src/proof/tactic.ts` now executes `intro`, `exact`, `rfl`, `assumption`, and the existing bounded `apply` against the focused goal. Successful completion removes only that goal and advances focus to the next pending goal; failed tactics leave the session unchanged. Completed proof terms are still rechecked by the Kernel.

`src/repl/repl.ts` provides `formatProofState`, showing numbered goals, focus, local context, targets, case labels, and the explicit completed-proof state.

This stage does **not** implement unification, implicit arguments, rewrite, induction semantics, simp, ring, Int, user-defined inductives, pattern matching, modules, imports, LSP, or `by` parsing.

### Verification

```text
npm run build -> success
npm test      -> 139 tests / 139 passed / 0 failed
```

No `src/kernel/` dependency on ProofState, Tactic, GoalId, Case, or metavariables was added.

The next planned milestone remains M19 — Unification. Do not begin it automatically.

## UI-1 — Web Shell

UI-1 is complete. A thin, static Vite shell now lives at the browser boundary without adding any dependency to the Kernel or Proof Engine. The page provides:

- Prover header and GitHub link;
- Natural Numbers lesson/theorem navigator;
- theorem title and current goal;
- local context display;
- tactic input and disabled Apply control;
- proof-state placeholder and explicit `UI-1 Web Shell` marker.

The UI is intentionally presentation-only. It does not run tactics, construct proof terms, or claim Kernel acceptance. Those responsibilities remain for the later Proof Engine adapter milestone.

The web build uses `VITE_BASE_PATH` for GitHub Pages repository subpaths and produces a static `dist-web/` bundle. Local development is available with `npm run dev:web`; production builds use `npm run build:web`.

### Verification

```text
npm run build:web -> success
npm run build     -> success
npm test          -> 130 tests / 130 passed / 0 failed
```

UI-1 is complete. Stop here; do not begin UI-2 automatically.
## UI-2 — Mock Proof Interaction

UI-2 is complete. The browser UI now talks to a UI-facing `ProofEngine` abstraction backed by an isolated `MockProofEngine`. The UI exposes theorem selection, tactic input, Apply, mock proof-state updates, user-facing errors, completion state, and basic multiple-goal display.

The mock boundary deliberately exposes only `ProofStateView`, `GoalView`, context display data, and `ProofResult`; it does not expose `MetaContext`, assignments, or Core terms. Successful mock results are labeled `Prototype / Mock Mode` and never claim Kernel acceptance.

### Verification

```text
npm run build:web -> success
npm run build     -> success
npm test          -> 146 tests / 146 passed / 0 failed
```

UI-2 is complete. Stop here; do not begin UI-3 automatically.

## UI-3 — Real Proof Engine Adapter

UI-3 connects the browser UI to the existing Proof Engine through a `RealProofEngine` adapter. The UI can now load real theorem states, run the existing bounded tactics (`intro`, `exact`, `rfl`, `assumption`, and `apply`), render the resulting proof state, report tactic failures, and display Kernel-accepted completion.

The browser-facing state remains deliberately narrow: `ProofStateView` exposes theorem names, goal IDs, rendered targets, and rendered local context only. Proof Engine internals, Core terms, metavariable assignments, and tactic session state stay behind the adapter.

Completed proofs are extracted through the existing `TacticSession.proof()` boundary, which rechecks the resulting Core term with the Kernel. The Kernel itself remains unchanged and continues to be the final trusted boundary.

### Verification

```text
npm test          -> 152 tests / 152 passed / 0 failed
npm run build     -> success
npm run build:web -> success
git diff --check  -> success
```

UI-3 is complete. Do not begin a later milestone automatically.

## UI-4 — Natural Number Tutorial

UI-4 adds a small Natural Numbers tutorial presentation layer with lesson/theorem selection, theorem reset, Kernel-backed completion, and next-theorem navigation. The UI continues to depend only on the browser-facing proof-engine views and result types.

The capability audit was performed through the existing `RealProofEngine` path. The current engine can complete:

```text
0 = 0        -> rfl -> Kernel accepted
n = n        -> intro; rfl -> Kernel accepted
```

The tutorial also exposes the planned addition content:

```text
n + 0 = n
0 + n = n
n + Succ m = Succ (n + m)
```

The capability audit found that `0 + n = n` is definitionally equal after `intro`, so UI-4 exposes that supported subtheorem through the real engine. The general `n + 0 = n` and `n + Succ m = Succ (n + m)` proofs remain unavailable with M17's current tactics. The Addition lesson therefore does not count as fully completed after proving only `0 + n = n`. UI-4 does not add unification, rewrite, induction, modify the Kernel, or fabricate completion.

`completedTheorems` is derived only from a successful `ProofResult` whose `state.completed` is true. A successful result is produced only after `RealProofEngine` extracts the proof and the existing Kernel check succeeds.

### Verification

```text
npm run build  -> success
npm test       -> 160 tests / 160 passed / 0 failed
npm run build:web -> success
```

UI-4 is complete for the audited capability scope. M19 is complete; M20/M21/M22 and UI-5/UI-6 are not started.

## Milestone 19 — Unification

M19 is complete. The Proof Engine now provides bounded unification for explicit theorem applications, reusing the M18 immutable `MetaContext` rather than adding a second metavariable infrastructure.

The core path is:

```text
apply theorem
    ↓
metavariables for explicit Pi arguments
    ↓
unify theorem conclusion with the current goal
    ↓
MetaContext assignments
    ↓
explicit Core application
    ↓
TacticSession.proof()
    ↓
Kernel inference/check
```

M19 covers simple variable assignment, application and nested-application unification, constructor mismatch rejection, occurs check, scope safety, assignment stability, and failed-unification rollback. `apply` can solve an explicit dependent theorem argument from the goal and leaves unresolved explicit arguments as proof goals.

The Kernel boundary is unchanged: `src/kernel/` was not modified, the Kernel does not understand metavariables, and final proof extraction still produces Core `Term` values that are checked by the Kernel.

M19 does not implement implicit arguments, rewrite, induction, simp, ring, automation, typeclass inference, UI-5, or UI-6.

### Verification

```text
npm run build      -> success
npm test           -> 168 tests / 168 passed / 0 failed
npm run build:web  -> success
git diff --check   -> success
```

M19 is complete. Stop here; do not begin M20 automatically.

## Milestone 20 — Implicit Arguments

M20 is complete. The Proof Engine now provides bounded implicit-argument inference on top of the existing M18 metavariable and M19 unification infrastructure.

The M20 path is:

```text
apply theorem
    ↓
create metavariables for Pi arguments
    ↓
mark implicit binders as inference-only
    ↓
unify theorem result with the current goal
    ↓
resolve implicit assignments
    ↓
create goals only for unresolved explicit arguments
    ↓
Core proof application
    ↓
TacticSession.proof()
    ↓
Kernel inference/check
```

Implemented and tested:

```text
single implicit argument inference
expected-type-driven inference
multiple implicit arguments
explicit + implicit argument interaction
implicit inference through application unification
failed implicit inference without guessing
conflicting constraints
scope-safe metavariable assignments
failed inference without session mutation
Kernel-backed apply integration
```

Implicit binders are represented as a small optional marker on `Pi` terms and do not add implicit-argument semantics to the Kernel. `src/kernel/` was not modified; substitution, reduction, typing, and final proof validation continue to operate on ordinary Core terms. Unresolved implicit arguments are rejected clearly instead of becoming user-visible proof goals.

M20 intentionally does not implement:

```text
rewrite
induction
simp
ring
automation
typeclass inference
general-purpose elaboration
UI-5
UI-6
```

### Verification

```text
npm run build      -> success
npm test           -> 174 tests / 174 passed / 0 failed
npm run build:web  -> success
git diff --check   -> success
```

M20 is complete. Stop here; do not begin M21 automatically.

## Milestone 21 — Rewrite

M21 adds bounded single-equality rewriting in the Proof Engine using the existing Core equality infrastructure and `EqRec`.

The proof path is:

```text
rewrite h
    ↓
inspect h : Eq A a b
    ↓
abstract the target into a dependent motive
    ↓
construct Core EqRec proof terms
    ↓
TacticSession.proof()
    ↓
Kernel inference/check
```

The user-facing rewrite transition is forward: a goal containing the equality's left endpoint is transformed to the corresponding goal containing its right endpoint. The proof construction internally derives equality symmetry with the existing `EqRec` primitive so the final proof term is accepted by the unchanged Kernel.

Implemented and tested:

```text
single equality rewrite
rewrite through application
rewrite in equality goals
Kernel-backed EqRec proof construction
non-equality hypothesis rejection
missing-match rejection
failed rewrite rollback
scope-safe dependent motive construction
```

M21 does not modify `src/kernel/`. It does not add a rewrite primitive, second metavariable system, second unifier, or UI state. No UI changes were required.

M21 explicitly does not implement:

```text
induction
simp
ring
automation
rewrite search
rewrite database
recursive rewriting
normalization engine
typeclass inference
general-purpose elaboration
UI-5
UI-6
```

### Verification

```text
npm run build -> success
npm test -> 177 tests / 177 passed / 0 failed
```

M21 is complete. Stop here; do not begin M22 automatically.


## Milestone 22 — Natural Number Induction

M22 adds bounded natural-number induction in the Proof Engine using the existing Core `NatRec` constructor.

The induction path is:

```text
induction n
    ↓
construct NatRec motive
    ↓
real base + successor ProofState goals
    ↓
successor context includes IH : P n
    ↓
solve both goals
    ↓
ordinary Core NatRec proof term
    ↓
TacticSession.proof()
    ↓
Kernel inference/check
```

Case names (`base`, `successor`) remain Proof Engine metadata only. The Kernel receives an ordinary Core `NatRec` term and has no dependency on ProofState, GoalId, case metadata, or tactic syntax. M22 reuses the existing multi-goal workflow, Core de Bruijn representation, M21 rewrite, and Kernel validation; no new metavariable or unification infrastructure was introduced.

The first implementation is deliberately bounded to induction over the newest local `Nat` binder, which supports the ordinary `intro; induction n` proof shape without adding dependent-local-context generalization. Failed variable lookup, non-`Nat` induction, and invalid target construction leave the session unchanged.

M22 does not implement:

```text
general induction automation
simp
ring
automation
proof search
rewrite search
typeclass inference
general-purpose elaboration
UI-5
UI-6
```

### Verification

```text
npm run build -> success
npm test -> 183 tests / 183 passed / 0 failed
npm run build:web -> success
git diff --check -> success
```

M22 is complete. Stop here; do not begin UI-5, UI-6, or M23 automatically.

## Chapters 1–4 — Natural Numbers Tutorial Registry

The tutorial is now structured as four chapters and ten stable exercise IDs in `src/ui/tutorial.ts`:

1. Natural Numbers — `numbers.zero_eq_zero`, `numbers.identity`, `numbers.zero_add`
2. Addition — `addition.add_zero`, `addition.add_succ`
3. Equality & Rewrite — `equality.transport`, `equality.rewrite`
4. Induction — `induction.add_zero`, `induction.zero_add`, `induction.succ_add_zero`

Exercise 4 and exercise 8 intentionally share the `add_zero` Core theorem builder but have distinct exercise IDs and progress records. Completion is recorded only from a successful `RealProofEngine` result whose `TacticSession.proof()` crosses the existing Kernel check; UI state cannot manufacture completion.

The real UI dispatch supports `intro`, `rfl`, `assumption`, `exact`, `apply`, `rewrite <hypothesis>`, and bounded `induction <name>`. Induction exposes base/successor goals and a real IH context; rewrite constructs an `EqRec` proof through the existing proof engine.

### Current bounded capability gaps

- Exercise 5 (`addition.add_succ`) remains a registered real goal but is unavailable in the tutorial UI because the current bounded induction compiler does not yet preserve de Bruijn scope correctly when an outer local remains during the induction proof. It is recorded as a capability gap rather than completed through a UI special case.
- Exercise 7 (`equality.rewrite`) is likewise registered but unavailable until its tutorial theorem/context shape is aligned with the existing Kernel-checked M21 rewrite proof path. The underlying rewrite tactic remains tested independently, including success, failure, and rollback.

The project deliberately does not add proof search, general induction, simp/rewrite search, ring/arith automation, new inductive types, pattern matching, modules/imports, LSP, or full dependent elaboration.

### Verification

```text
npm test          -> 183 tests / 183 passed / 0 failed
npm run build:web -> success
git diff --check  -> success
```

The Kernel remains independent of Chapter, Exercise, UI, and tactic metadata.

## Decimal numeral expansion

Decimal literals are represented as unary `Succ` nodes. To keep a short input
from exhausting memory, each call to `parse` allows at most 10,000 successors
introduced by decimal literals across the whole term. For example,
`Eq Nat 6000 4000` fits the parser budget, while `Eq Nat 6000 6000` is rejected
with a `ParseError` before the second literal is expanded. Leading zeroes do not
change a literal's cost, and each new parse starts with a fresh budget.

The REPL reports this error and accepts subsequent commands; rejected definitions
are not added to the environment. This limit bounds decimal expansion only.
It does not change Core numeral construction or guarantee that deeply nested
terms can be elaborated, type checked, or evaluated within runtime stack limits.
