# prover-typescript — NEXT

The current workspace has completed M18 — Metavariables and the subsequent Multi-Goal / Case / Proof UX infrastructure.

## Current verification

```text
npm run build -> success
npm test      -> 139 tests / 139 passed / 0 failed
```

The local `npm` tool wrapper returned `spawn EINVAL`, so this verification run executed `npm run build` / `npm test` directly through PowerShell; the commands themselves succeeded.

## Multi-Goal / Case / Proof UX — complete

This stage extends only the Proof Engine / Proof UX and adds no Kernel semantics.

Added capabilities:

```text
GoalId
focusedGoalId
currentGoal / focusGoal / focusNext / focusPrevious
caseName
solveCurrentGoal
focused-goal tactic execution
automatic focus after goal completion
REPL ProofState formatter
```

Goal identity is stable Proof Engine metadata; identities are not reused when goals are completed or reordered. Case names are likewise used only for ProofState / UI display and do not enter Core terms or the Kernel.

The tactic session now explicitly targets the focused goal. Failed `intro`, `exact`, `rfl`, `assumption`, or `apply` tactics preserve the original session. After the current goal is solved, focus moves to the next pending goal in creation order, or to the previous goal if no successor remains.

`apply` retains the M17 boundary: only non-dependent Pi arguments are supported; this stage does not implement unification.

The REPL layer adds `formatProofState`, which can display:

```text
Goals:

▶ Goal 1 (case-name)
  x : A
  ⊢ B

  Goal 2
  ⊢ C
```

When there are no goals, it displays:

```text
No goals.
Proof complete.
```

Tests cover stable goal identity, focus navigation, case metadata, focused tactics, automatic focus, rollback on failure, REPL display, and continued Kernel inference/check of the final proof.

### Explicitly not implemented

```text
unification
implicit arguments
rewrite
induction semantics
simp
ring
Int
user-defined inductives
pattern matching
modules
imports
LSP
by parser
```

### Kernel boundary

This stage adds no ProofState, Tactic, GoalId, Case, or metavariable dependencies to `src/kernel/`. Case / focus / goal identity remain entirely in the Proof Engine layer; proof extraction still produces a Core `Term` for the Kernel.

## Post-M19 next stage

The next stage is:

```text
M20 — Implicit Arguments
```

M19 is complete; do not begin M20 automatically.

## UI-2 — Mock Proof Interaction — complete

UI-2 adds the browser-facing `ProofEngine` abstraction and an isolated `MockProofEngine` under `src/ui/`. The UI now supports theorem selection, tactic input / Apply, mock Proof State updates, readable error messages, explicit `Prototype / Mock Mode`, completion display, and multiple goals.

The UI-facing model contains only presentation data (`ProofStateView`, `GoalView`, `ContextEntryView`) and never exposes Proof Engine internals such as `MetaContext`, assignments, or Core terms. Mock success is explicitly not Kernel acceptance.

### Verification

```text
npm run build     -> success
npm test          -> 146 tests / 146 passed / 0 failed
npm run build:web -> success
```

### Next stage

```text
UI-3 — Real Proof Engine Adapter
```

Do not begin UI-3 automatically.

## UI-3 — Real Proof Engine Adapter — complete

UI-3 connects the browser UI to the existing Proof Engine through `RealProofEngine`.

The adapter reuses `ProofState`, `TacticSession`, the existing parser/elaborator path for tactic arguments, and the existing Kernel validation performed by proof extraction. The browser-facing `ProofStateView` remains presentation-only and does not expose Core terms, metavariable assignments, or internal tactic state.

Supported browser tactics are the existing bounded proof-engine operations:

```text
intro
exact <term>
rfl
assumption
apply <term>
```

Successful completion calls proof extraction, which performs the existing Kernel inference check. Tactic failures return a user-facing error while preserving the previous session state.

### Verification

```text
npm test          -> 152 tests / 152 passed / 0 failed
npm run build     -> success
npm run build:web -> success
git diff --check  -> success
```

The UI remains an adapter over the existing Proof Engine; no ProofState, Tactic, or UI metadata was moved into `src/kernel/`.

### Next stage

The next stage is not started automatically. Re-check the workspace and choose the next explicitly authorized milestone before making further changes.

## UI-4 — Natural Number Tutorial — complete for audited capability scope

UI-4 adds the Natural Numbers lesson model and browser navigation:

```text
Natural Numbers
  01 Zero
  02 Equality
  03 Addition
  04 Addition: Successor
```

The lesson/theorem model is UI-facing presentation metadata. The UI resets to a fresh `RealProofEngine` session when a theorem is selected, and `Next theorem` also starts a fresh session.

Capability audit results through the real path:

```text
0 = 0
  rfl
  ↓
RealProofEngine
  ↓
TacticSession.proof()
  ↓
Kernel accepted

n = n
  intro; rfl
  ↓
RealProofEngine
  ↓
TacticSession.proof()
  ↓
Kernel accepted
```

The addition tutorial content is exposed with the audited partial capability:

```text
0 + n = n
  intro; rfl
  ↓
Kernel accepted

n + 0 = n
  not currently completable by M17

n + Succ m = Succ (n + m)
  not currently completable by M17
```

The Addition lesson does not become a completed lesson item after only the supported `0 + n = n` subtheorem is proved. M17 still lacks the unification/rewrite/induction capabilities needed for the remaining general proofs.

Completion state is driven only by a successful `ProofResult` with `state.completed === true`; the UI never sets completion directly. `MockProofEngine` remains intact for existing prototype/regression coverage and is not used to claim tutorial completion.

### Verification

```text
npm run build     -> success
npm test          -> 160 tests / 160 passed / 0 failed
npm run build:web -> success
git diff --check  -> success
```

### Explicitly not implemented

```text
M19 Unification
M20 Implicit Arguments
M21 Rewrite
M22 Induction
UI-5
UI-6
```

## M19 — Unification — complete

M19 adds bounded proof-engine unification for explicit theorem applications.

```text
apply theorem
    ↓
metavariables for explicit Pi arguments
    ↓
unify theorem conclusion with current goal
    ↓
MetaContext assignments
    ↓
explicit Core application
    ↓
TacticSession.proof()
    ↓
Kernel inference/check
```

Implemented and tested: simple variable assignment, application and nested-application unification, constructor mismatch rejection, occurs check, scope safety, assignment stability, and failed-unification rollback.

`apply` can now solve an explicit dependent theorem argument from the current goal, while unresolved explicit arguments remain as proof goals. This does not implement implicit arguments.

M19 reuses the M18 `MetaContext` infrastructure and does not modify `src/kernel/`. Metavariables and unification remain in the Proof Engine; extracted proofs are Core `Term` values checked by the Kernel.

M19 does not implement implicit arguments, rewrite, induction, simp, ring, automation, typeclass inference, UI-5, or UI-6.

### Verification

```text
npm run build      -> success
npm test           -> 168 tests / 168 passed / 0 failed
npm run build:web  -> success
git diff --check   -> success
```

M19 is complete. Stop here; do not begin M20 automatically.

## M20 — Implicit Arguments — complete

M20 adds bounded implicit-argument inference on top of the existing metavariable and unification infrastructure.

Implemented path:

```text
apply theorem
    ↓
metavariables for Pi arguments
    ↓
implicit binders marked inference-only
    ↓
expected goal drives unification
    ↓
implicit assignments resolved
    ↓
unresolved explicit arguments remain as proof goals
    ↓
Core proof term
    ↓
Kernel acceptance
```

Implemented and tested:

```text
basic implicit inference
expected-type-driven inference
multiple implicit arguments
explicit + implicit interaction
implicit inference through application/unification
failed implicit inference without guessing
conflicting constraints
scope safety via existing MetaContext/unification checks
failed inference without state mutation
Kernel-backed integration
```

The implementation reuses M18 `MetaContext` and M19 `unify`; no second inference or metavariable infrastructure was added. The Kernel was not modified and does not understand implicit-argument inference.

Explicitly not implemented:

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

M20 is complete and committed independently. Stop here; do not begin M21 automatically.

## M21 — Rewrite — complete

M21 adds bounded single-equality rewriting in the Proof Engine using the existing Core equality infrastructure.

Implemented path:

```text
rewrite equality proof
    ↓
inspect Eq type and locate the left endpoint in the target
    ↓
construct a dependent motive
    ↓
construct ordinary Core EqRec proof terms
    ↓
TacticSession.proof()
    ↓
Kernel inference/check
```

The rewrite tactic preserves the Proof Engine / Kernel boundary. The Kernel was not modified and does not understand the `rewrite` tactic. Reverse orientation is implemented internally through an EqRec-derived equality symmetry proof so the user-facing operation remains a forward `rewrite h` transition from the old target to the rewritten target.

Implemented and tested:

```text
single equality rewrite
rewrite through application
rewrite in equality targets
Kernel-backed EqRec proof construction
non-equality hypothesis rejection
missing-match rejection
failed rewrite without state mutation
scope-safe dependent motive construction
```

M21 reuses the existing `Eq`, `Refl`, `EqRec`, definitional equality, Core type checking, and ProofState machinery. No second metavariable or unification infrastructure was added. No UI changes were required.

Explicitly not implemented:

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
npm run build      -> success
npm test           -> 177 tests / 177 passed / 0 failed
npm run build:web  -> success
npm run git checks -> success
```

M21 is complete at the Proof Engine/test level and must be independently verified, documented, committed, then stopped. Do not begin M22 automatically.


## M22 — Natural Number Induction — complete

M22 adds bounded natural-number induction in the Proof Engine using the existing Core `NatRec` constructor. Induction creates two real ProofState goals:

```text
base
  ⊢ P 0

successor
  n : Nat
  IH : P n
  ⊢ P (Succ n)
```

The `base` / `successor` labels remain Proof Engine case metadata. The successor proof is compiled with the two binders required by Core `NatRec`, so the induction hypothesis is a real lambda-bound Core term. Completed induction proofs are extracted through `TacticSession.proof()` and checked by the unchanged Kernel.

The first implementation is intentionally bounded to the newest local `Nat` binder. This supports the ordinary `intro; induction n` shape without adding dependent-local-context generalization. Existing M18 metavariables and M19/M20 unification/implicit inference are reused by the rest of the tactic engine; M22 adds no induction-specific metavariable infrastructure. M21 rewrite is reusable in successor cases.

Verified coverage includes real two-goal construction, case metadata, induction hypotheses, focused-goal solving, Kernel-backed `NatRec` extraction, `n + 0 = n` through `intro; induction n; ... rewrite ...`, rejection of non-`Nat` and missing variables, and rollback on invalid targets.

M22 does not implement general induction automation, simplification, ring normalization, proof search, rewrite search, typeclass inference, general-purpose elaboration, UI-5, or UI-6.

### Verification

```text
npm run build -> success
npm test -> 183 tests / 183 passed / 0 failed
npm run build:web -> success
git diff --check -> success
git diff -- src/kernel/ -> empty
```

M22 is complete. The next milestone must begin with a fresh Capability Audit.
