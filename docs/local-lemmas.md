# Local lemmas with `have`

Use `have` in the real proof interface to name an intermediate result and reuse
it in the rest of a proof. A declaration can either create a proof obligation or
provide a proof immediately:

```text
have name : type
have name : type := proof
```

For the `zero` theorem, the following commands prove an intermediate equality
and then use it to close the original goal:

```text
have h : Eq Nat 0 0
rfl
assumption
```

The first command creates two goals. The first asks for a proof of the declared
type, in the original context. The second continues the original proof with
`h : Eq Nat 0 0` added to its context. The proof remains incomplete until both
goals are solved, even if the continuation is solved first through the tactic
session API. Other pending goals retain their own contexts and identities.

For the `identity` theorem, an immediate proof can refer to an introduced local:

```text
intro
have h : Eq Nat n n := Refl Nat n
exact h
```

Local functions and dependent types use the existing term syntax. For example,
this script proves `zero` using a local function that returns an equality proof:

```text
have prove : (n : Nat) -> Eq Nat 0 0 := (n : Nat) => Refl Nat 0
exact prove 0
```

## Names and parsing

A name must start with an ASCII letter or underscore and continue with ASCII
letters, digits, underscores, or apostrophes. It must not already exist in the
focused goal's context. `Type`, `Nat`, `Succ`, `Eq`, and `Refl` are reserved term
syntax and cannot name a local lemma.

In the continuation, a local lemma is an assumption with its declared type. It
does not unfold to its supplied proof during tactic execution. In particular,
`have n : Nat := 0` makes `n : Nat` available, but does not make `n` definitionally
equal to `0` inside the continuation.

The declaration requires an explicit type. The optional `:=` separator must
occur once, outside balanced parentheses, with a nonempty proof after it. Types
and proofs are parsed separately by the existing term parser. The wrapper does
not add nested declarations, semicolon scripts, type inference, or new term
syntax. Both terms are elaborated in the preceding context, so a lemma cannot
refer to itself. Loading a different theorem clears local declarations along
with the current proof session.

## Tactic session API and checking

`TacticSession.have(name, type, proof?)` is immutable. It checks the declaration
type against `Type` and checks an optional proof against that type before
creating goals. A failure leaves the current session unchanged. Without an
immediate proof, the new lemma goal receives the case label `have name`; the
continuation retains the original case label.

The continuation shifts the old goal beneath the new local binder. Proof
extraction represents the declaration as ordinary Core lambda application:

```text
((name : type) => continuationProof) lemmaProof
```

No new Kernel term or trusted assumption is introduced. All lemma obligations
must be solved before extraction, and completed proofs pass through the existing
Kernel checks. The tests also check extracted proofs against their original
targets, including dependent local contexts and nested declarations.
