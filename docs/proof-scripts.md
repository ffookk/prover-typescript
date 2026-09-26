# Proof scripts

The **Proof script** editor runs several tactics as one transaction against the
current theorem and focused goal. Enter one tactic per line and select **Run
script**. It uses the same tactic dispatcher as the single-tactic input.

For the **Identity** exercise, starting from its initial goal:

```text
-- Introduce the natural number, then prove reflexivity.
intro
rfl
```

For **n + 0 = n**, starting from its initial goal:

```text
intro
induction n
rfl -- Base case
rewrite IH
rfl -- Successor case
```

Blank lines are ignored. `--` starts a comment through the end of a line,
including after a tactic. LF, CRLF, and CR line endings are supported. Tactics
and their arguments must fit on one physical line; semicolons, multiline terms,
and script-level control flow are not supported. Script comments are processed
by the script reader and do not change the single-tactic parser.

## Transactions and replay

A successful script commits every tactic to the normal tactic history. It may
leave pending goals; continue with another script or the single-tactic input.
Each tactic sees the state produced by the preceding tactic, including newly
introduced local names and the next focused goal after a case is solved.

If any line fails, all changes from that run are discarded. Existing goals,
their focus, and tactic history are restored, and the editor keeps the source
for correction. Errors name the original physical line, including blank and
comment lines in the count. For example:

```text
intro
exact Nat
```

On Identity this reports an error on line 2 and restores the initial goal;
`intro` is not retained. A command after a completed proof also fails and rolls
back the whole script. There is no silent truncation after an early success.

Scripts continue from the current proof; they do not reset it automatically. To
replay a complete proof from the beginning, select the exercise again before
running its script. Successful runs clear the editor, while failed runs keep
its text. Selecting a different exercise clears the editor. Scripts are not
saved to persistent browser storage.

Completion is accepted only after proof extraction and a Kernel check against
the original theorem type. A proof of a different type cannot be committed as
a successful script. Course progress is updated only after the complete
transaction succeeds.

## Programmatic use

```ts
import { RealProofEngine } from "../src/ui/proof-engine";

const engine = new RealProofEngine();
engine.loadTheorem("identity");
const result = engine.runScript("intro\nrfl");

if (result.kind === "error") {
  console.log(result.line, result.message);
} else {
  console.log(result.commandsExecuted, result.state.completed);
}
```

`runScript` returns detached presentation state, just like `runTactic`. A
successful result includes `commandsExecuted`; an error tied to a command
includes its one-based `line`. Whole-script errors such as empty input or
excess source length have no line number. `MockProofEngine` does not implement
scripts or claim Kernel acceptance.

## Limits

The entire source is checked before the first tactic runs:

- At most 65,536 JavaScript string code units, including comments and whitespace.
- At most 256 nonempty tactic lines, excluding comments and blank lines.
- Empty and comment-only scripts are rejected.

These bounds limit script size and command count. They do not impose a timeout
or reduction budget on an individual tactic. Execution is synchronous and has
the same computational limits as entering each tactic separately.

Scripts only dispatch the existing proof tactics. They do not evaluate
JavaScript, read files, make network requests, or introduce Kernel primitives.
