import { check, infer, show } from '../kernel/typecheck';
import { definitionalEqual, normalize, shift, whnf } from '../kernel/reduction';
import { Term, Nat, Zero, app, eqRec, lambda, natRec, refl, succ, variable } from '../syntax/ast';
import { Context, Goal, GoalId, ProofState, goal, proofState } from './state';
import { MetaContext } from './metavariable/meta';
import { UnificationError, UnificationTerm, substituteUnification, toCoreTerm, unify } from './unification';

export class TacticError extends Error {
  constructor(message: string) { super(message); this.name = 'TacticError'; }
}

type ProofNode =
  | { readonly kind: 'hole'; readonly id: GoalId }
  | { readonly kind: 'term'; readonly term: Term; readonly depth: number }
  | { readonly kind: 'lambda'; readonly domain: Term; readonly name?: string; readonly body: ProofNode }
  | { readonly kind: 'app'; readonly fn: ProofNode; readonly arg: ProofNode }
  | { readonly kind: 'eqRec'; readonly motive: Term; readonly left: Term; readonly right: Term; readonly equality: Term; readonly reflCase: ProofNode }
  | { readonly kind: 'natRec'; readonly motive: Term; readonly scrutinee: Term; readonly zeroCase: ProofNode; readonly succCase: ProofNode };

interface Hole { readonly id: GoalId; readonly goal: Goal; readonly depth: number; }

type ProofStateInput = ProofState | { readonly goals: readonly Goal[]; readonly focusedGoalId?: GoalId | null };

function contextTypes(context: Context): readonly Term[] { return context.map((entry) => entry.type); }

function abstractEqualityTarget(term: Term, pattern: Term, depth = 0): { readonly term: Term; readonly found: boolean } {
  if (definitionalEqual(term, pattern)) return { term: variable(depth), found: true };
  switch (term.kind) {
    case 'Type': case 'Nat': case 'Zero': case 'Var': return { term, found: false };
    case 'Pi': {
      const domain = abstractEqualityTarget(term.domain, pattern, depth);
      const body = abstractEqualityTarget(term.body, shift(pattern, 1), depth + 1);
      return { term: { ...term, domain: domain.term, body: body.term }, found: domain.found || body.found };
    }
    case 'Lambda': {
      const domain = abstractEqualityTarget(term.domain, pattern, depth);
      const body = abstractEqualityTarget(term.body, shift(pattern, 1), depth + 1);
      return { term: { ...term, domain: domain.term, body: body.term }, found: domain.found || body.found };
    }
    case 'App': {
      const fn = abstractEqualityTarget(term.fn, pattern, depth);
      const arg = abstractEqualityTarget(term.arg, pattern, depth);
      return { term: app(fn.term, arg.term), found: fn.found || arg.found };
    }
    case 'Succ': {
      const value = abstractEqualityTarget(term.value, pattern, depth);
      return { term: { ...term, value: value.term }, found: value.found };
    }
    case 'NatRec': {
      const motive = abstractEqualityTarget(term.motive, pattern, depth);
      const zeroCase = abstractEqualityTarget(term.zeroCase, pattern, depth);
      const succCase = abstractEqualityTarget(term.succCase, pattern, depth);
      const scrutinee = abstractEqualityTarget(term.scrutinee, pattern, depth);
      return { term: { ...term, motive: motive.term, zeroCase: zeroCase.term, succCase: succCase.term, scrutinee: scrutinee.term }, found: motive.found || zeroCase.found || succCase.found || scrutinee.found };
    }
    case 'Eq': {
      const type = abstractEqualityTarget(term.type, pattern, depth);
      const left = abstractEqualityTarget(term.left, pattern, depth);
      const right = abstractEqualityTarget(term.right, pattern, depth);
      return { term: { ...term, type: type.term, left: left.term, right: right.term }, found: type.found || left.found || right.found };
    }
    case 'Refl': {
      const type = abstractEqualityTarget(term.type, pattern, depth);
      const value = abstractEqualityTarget(term.value, pattern, depth);
      return { term: { ...term, type: type.term, value: value.term }, found: type.found || value.found };
    }
    case 'EqRec': {
      const motive = abstractEqualityTarget(term.motive, pattern, depth);
      const reflCase = abstractEqualityTarget(term.reflCase, pattern, depth);
      const left = abstractEqualityTarget(term.left, pattern, depth);
      const right = abstractEqualityTarget(term.right, pattern, depth);
      const equality = abstractEqualityTarget(term.equality, pattern, depth);
      return { term: { ...term, motive: motive.term, reflCase: reflCase.term, left: left.term, right: right.term, equality: equality.term }, found: motive.found || reflCase.found || left.found || right.found || equality.found };
    }
  }
}

function replaceNode(root: ProofNode, id: GoalId, replacement: ProofNode): ProofNode {
  if (root.kind === 'hole') return root.id === id ? replacement : root;
  if (root.kind === 'term') return root;
  if (root.kind === 'lambda') return { ...root, body: replaceNode(root.body, id, replacement) };
  if (root.kind === 'app') return { kind: 'app', fn: replaceNode(root.fn, id, replacement), arg: replaceNode(root.arg, id, replacement) };
  if (root.kind === 'eqRec') return { ...root, reflCase: replaceNode(root.reflCase, id, replacement) };
  return { ...root, zeroCase: replaceNode(root.zeroCase, id, replacement), succCase: replaceNode(root.succCase, id, replacement) };
}

function compile(root: ProofNode, depth = 0): Term {
  switch (root.kind) {
    case 'hole': throw new TacticError(`Unsolved proof goal #${root.id}`);
    case 'term': return shift(root.term, depth - root.depth);
    case 'lambda': return lambda(root.domain, compile(root.body, depth + 1), root.name);
    case 'app': return app(compile(root.fn, depth), compile(root.arg, depth));
    case 'eqRec': return eqRec(root.motive, compile(root.reflCase, depth), root.left, root.right, root.equality);
    case 'natRec': {
      const successorCase = lambda(
        Nat,
        lambda(app(shift(root.motive, 1), variable(0, 'n')), compile(root.succCase, depth + 2), 'IH'),
        'n',
      );
      return natRec(root.motive, compile(root.zeroCase, depth), successorCase, root.scrutinee);
    }
  }
}

function abstractInductionVariable(term: Term, targetIndex: number, depth = 0): Term {
  switch (term.kind) {
    case 'Var': return term.index === targetIndex + depth ? variable(depth, term.name) : term;
    case 'Type': case 'Nat': case 'Zero': return term;
    case 'Pi': return { ...term, domain: abstractInductionVariable(term.domain, targetIndex, depth), body: abstractInductionVariable(term.body, targetIndex, depth + 1) };
    case 'Lambda': return { ...term, domain: abstractInductionVariable(term.domain, targetIndex, depth), body: abstractInductionVariable(term.body, targetIndex, depth + 1) };
    case 'App': return app(abstractInductionVariable(term.fn, targetIndex, depth), abstractInductionVariable(term.arg, targetIndex, depth));
    case 'Succ': return succ(abstractInductionVariable(term.value, targetIndex, depth));
    case 'NatRec': return natRec(abstractInductionVariable(term.motive, targetIndex, depth), abstractInductionVariable(term.zeroCase, targetIndex, depth), abstractInductionVariable(term.succCase, targetIndex, depth + 2), abstractInductionVariable(term.scrutinee, targetIndex, depth));
    case 'Eq': return { ...term, type: abstractInductionVariable(term.type, targetIndex, depth), left: abstractInductionVariable(term.left, targetIndex, depth), right: abstractInductionVariable(term.right, targetIndex, depth) };
    case 'Refl': return { ...term, type: abstractInductionVariable(term.type, targetIndex, depth), value: abstractInductionVariable(term.value, targetIndex, depth) };
    case 'EqRec': return { ...term, motive: abstractInductionVariable(term.motive, targetIndex, depth), reflCase: abstractInductionVariable(term.reflCase, targetIndex, depth), left: abstractInductionVariable(term.left, targetIndex, depth), right: abstractInductionVariable(term.right, targetIndex, depth), equality: abstractInductionVariable(term.equality, targetIndex, depth) };
  }
}

export class TacticSession {
  readonly state: ProofState;
  private readonly root: ProofNode;
  private readonly holes: readonly Hole[];
  private readonly rootContext: Context;

  private constructor(state: ProofState, root: ProofNode, holes: readonly Hole[], rootContext: Context) {
    this.state = state; this.root = root; this.holes = holes; this.rootContext = rootContext;
  }

  static fromState(input: ProofStateInput): TacticSession {
    const state = proofState(input.goals, input.focusedGoalId);
    if (state.goals.length !== 1) throw new TacticError('A tactic session must start from one root goal');
    const rootGoal = state.goals[0];
    const hole = { id: rootGoal.id!, goal: rootGoal, depth: 0 };
    return new TacticSession(state, { kind: 'hole', id: hole.id }, [hole], hole.goal.context);
  }

  currentGoal(): Goal | undefined { return this.state.goals.find(item => item.id === this.state.focusedGoalId); }

  focusGoal(id: GoalId): TacticSession {
    if (!this.holes.some(hole => hole.id === id)) throw new TacticError(`Goal id not found: ${id}`);
    return new TacticSession(proofState(this.holes.map(hole => hole.goal), id), this.root, this.holes, this.rootContext);
  }

  next(): TacticSession {
    if (this.holes.length === 0) return this;
    const index = this.holes.findIndex(hole => hole.id === this.state.focusedGoalId);
    if (index < 0) throw new TacticError('Focused goal does not exist');
    return this.focusGoal(this.holes[(index + 1) % this.holes.length].id);
  }

  previous(): TacticSession {
    if (this.holes.length === 0) return this;
    const index = this.holes.findIndex(hole => hole.id === this.state.focusedGoalId);
    if (index < 0) throw new TacticError('Focused goal does not exist');
    return this.focusGoal(this.holes[(index - 1 + this.holes.length) % this.holes.length].id);
  }

  intro(): TacticSession {
    const hole = this.firstHole();
    const type = whnf(hole.goal.type);
    if (type.kind !== 'Pi') throw new TacticError(`intro expected a function goal, found ${show(type)}`);
    const newGoal = goal([...hole.goal.context, { name: type.name ?? 'x', type: type.domain }], type.body, hole.goal.caseName);
    const child = { id: newGoal.id!, goal: newGoal, depth: hole.depth + 1 };
    const root = replaceNode(this.root, hole.id, { kind: 'lambda', domain: type.domain, name: type.name, body: { kind: 'hole', id: child.id } });
    return this.withReplacement(hole.id, [child], root);
  }

  intros(): TacticSession {
    let session = this.intro();
    while (whnf(session.currentGoal()!.type).kind === 'Pi') session = session.intro();
    return session;
  }

  exact(term: Term): TacticSession {
    const hole = this.firstHole();
    try { check(contextTypes(hole.goal.context), term, hole.goal.type); }
    catch (error) { throw new TacticError(error instanceof Error ? error.message : String(error)); }
    const root = replaceNode(this.root, hole.id, { kind: 'term', term, depth: hole.depth });
    return this.withReplacement(hole.id, [], root);
  }

  solveCurrentGoal(term: Term): TacticSession { return this.exact(term); }

  rfl(): TacticSession {
    const hole = this.firstHole();
    const type = whnf(hole.goal.type);
    if (type.kind !== 'Eq') throw new TacticError(`rfl expected an equality goal, found ${show(type)}`);
    if (!definitionalEqual(type.left, type.right)) throw new TacticError(`rfl requires definitionally equal endpoints: ${show(type.left)} and ${show(type.right)}`);
    return this.exact(refl(type.type, type.left));
  }

  rewrite(equalityProof: Term): TacticSession {
    const hole = this.firstHole();
    let equalityType: Term;
    try { equalityType = whnf(infer(contextTypes(hole.goal.context), equalityProof)); }
    catch (error) { throw new TacticError(error instanceof Error ? error.message : String(error)); }
    if (equalityType.kind !== 'Eq') throw new TacticError(`rewrite expected an equality proof, found ${show(equalityType)}`);

    // Rewrite should see through definitional computation.  Addition recurses
    // on its first argument, so a target such as `Succ n + Succ 0` is stored
    // as a recursor but normalizes to `Succ (n + Succ 0)`.  Matching the raw
    // target misses the IH occurrence in that normalized subterm.
    const target = normalize(hole.goal.type);
    const abstraction = abstractEqualityTarget(shift(target, 1), shift(equalityType.left, 1));
    if (!abstraction.found) throw new TacticError(`rewrite found no match for ${show(equalityType.left)} in ${show(hole.goal.type)}`);

    const motive = lambda(equalityType.type, abstraction.term);
    const rewrittenType = whnf(app(motive, equalityType.right));
    const childGoal = goal(hole.goal.context, rewrittenType, hole.goal.caseName);
    const child = { id: childGoal.id!, goal: childGoal, depth: hole.depth };
    const symmetryMotive = lambda(equalityType.type, {
      kind: 'Eq', type: shift(equalityType.type, 1), left: variable(0), right: shift(equalityType.left, 1),
    });
    const symmetryProof = eqRec(symmetryMotive, refl(equalityType.type, equalityType.left), equalityType.left, equalityType.right, equalityProof);
    const root = replaceNode(this.root, hole.id, {
      kind: 'eqRec',
      motive,
      left: equalityType.right,
      right: equalityType.left,
      equality: symmetryProof,
      reflCase: { kind: 'hole', id: child.id },
    });
    return this.withReplacement(hole.id, [child], root);
  }

  induction(name: string): TacticSession {
    const hole = this.firstHole();
    const variableName = name.trim();
    if (!variableName) throw new TacticError('induction expects a variable name');

    // M22 intentionally bounds induction to the newest local binder. This
    // avoids dependent-local-context generalization while supporting the
    // ordinary `intro; induction n` proof shape.
    const index = hole.goal.context.length - 1;
    const entry = hole.goal.context[index];
    if (!entry || entry.name !== variableName) {
      throw new TacticError(`induction variable not found in the current context: ${variableName}`);
    }
    if (!definitionalEqual(entry.type, Nat)) {
      throw new TacticError(`induction requires a Nat variable, found ${show(entry.type)}`);
    }

    // Validate the current target before allocating any goals. No session
    // state is changed if construction is rejected.
    try { infer(contextTypes(hole.goal.context), hole.goal.type); }
    catch (error) { throw new TacticError(error instanceof Error ? error.message : String(error)); }

    // Context entries are presented oldest-to-newest, while Core variables
    // use de Bruijn indices newest-to-oldest. The newest local binder
    // therefore has Core index 0, even when it is at context position > 0.
    // Passing the presentation position here accidentally abstracted an
    // outer variable (for example `m` in `m, n`), producing an invalid
    // motive for `add_succ`.
    const targetIndex = hole.goal.context.length - 1 - index;
    const motive = lambda(Nat, abstractInductionVariable(hole.goal.type, targetIndex), variableName);
    const baseContext = hole.goal.context.slice(0, -1);

    // `motive` is closed over the base context. When it is instantiated in
    // the successor context, shift it over the two binders introduced by the
    // induction case (`x` and `IH`). Otherwise beta-reduction captures the
    // outer variable `n` in the `IH` slot.
    const baseType = normalize(app(motive, Zero));
    const successorTarget = normalize(app(shift(motive, 2), succ(variable(1, variableName))));
    const baseGoal = goal(baseContext, baseType, 'base');
    // The IH type is stored in the context *before* the IH binder is
    // introduced (`baseContext + x`), so it only crosses that one binder.
    // The successor goal itself lives under both `x` and `IH`, hence the
    // separate shift by two above.
    const inductionHypothesis = normalize(app(shift(motive, 1), variable(0, variableName)));
    const successorContext: Context = [
      ...baseContext,
      { name: variableName, type: Nat },
      { name: 'IH', type: inductionHypothesis },
    ];
    const successorGoal = goal(successorContext, successorTarget, 'successor');
    const baseHole: Hole = { id: baseGoal.id!, goal: baseGoal, depth: hole.depth };
    const successorHole: Hole = { id: successorGoal.id!, goal: successorGoal, depth: hole.depth + 2 };
    const root = replaceNode(this.root, hole.id, {
      kind: 'natRec',
      motive,
      scrutinee: variable(targetIndex, variableName),
      zeroCase: { kind: 'hole', id: baseHole.id },
      succCase: { kind: 'hole', id: successorHole.id },
    });
    return this.withReplacement(hole.id, [baseHole, successorHole], root);
  }

  assumption(): TacticSession {
    const hole = this.firstHole();
    for (let index = hole.goal.context.length - 1; index >= 0; index--) {
      const entry = hole.goal.context[index];
      const entryType = shift(entry.type, hole.goal.context.length - index);
      if (definitionalEqual(entryType, hole.goal.type)) return this.exact(variable(hole.goal.context.length - 1 - index, entry.name));
    }
    throw new TacticError(`assumption found no local hypothesis matching ${show(hole.goal.type)}`);
  }

  apply(term: Term): TacticSession {
    const hole = this.firstHole();
    let currentType: Term;
    try { currentType = whnf(infer(contextTypes(hole.goal.context), term)); }
    catch (error) { throw new TacticError(error instanceof Error ? error.message : String(error)); }

    let metaContext = MetaContext.empty();
    const argumentsForProof: Array<{ readonly type: UnificationTerm; readonly meta: UnificationTerm; readonly implicit: boolean }> = [];
    while (currentType.kind === 'Pi') {
      const created = metaContext.create(hole.goal.context.length, currentType.domain);
      metaContext = created.context;
      argumentsForProof.push({ type: currentType.domain, meta: created.term, implicit: currentType.implicit === true });
      currentType = whnf(substituteUnification(currentType.body, created.term) as Term);
    }
    if (argumentsForProof.length === 0) throw new TacticError(`apply expected a function, found ${show(currentType)}`);

    try { metaContext = unify(currentType, hole.goal.type, metaContext); }
    catch (error) {
      if (error instanceof UnificationError) throw new TacticError(error.message);
      throw new TacticError(error instanceof Error ? error.message : String(error));
    }

    const childHoles: Hole[] = [];
    const argumentNodes: ProofNode[] = [];
    for (const argument of argumentsForProof) {
      const resolved = metaContext.resolve((argument.meta as { kind: 'meta'; id: number }).id);
      if (resolved.kind === 'term') {
        argumentNodes.push({ kind: 'term', term: resolved.term, depth: hole.depth });
      } else if (argument.implicit) {
        throw new TacticError(`Could not infer implicit argument ?m${resolved.id}`);
      } else {
        let childType: Term;
        try { childType = toCoreTerm(argument.type, metaContext); }
        catch (error) { throw new TacticError(error instanceof Error ? error.message : String(error)); }
        const childGoal = goal(hole.goal.context, childType);
        const child = { id: childGoal.id!, goal: childGoal, depth: hole.depth };
        childHoles.push(child);
        argumentNodes.push({ kind: 'hole', id: child.id });
      }
    }

    let node: ProofNode = { kind: 'term', term, depth: hole.depth };
    for (const argumentNode of argumentNodes) node = { kind: 'app', fn: node, arg: argumentNode };
    return this.withReplacement(hole.id, childHoles, replaceNode(this.root, hole.id, node));
  }

  proof(): Term {
    if (this.holes.length !== 0) throw new TacticError(`Cannot extract proof: ${this.holes.length} goal(s) remain`);
    const result = compile(this.root);
    infer(contextTypes(this.rootContext), result);
    return result;
  }

  private firstHole(): Hole {
    const hole = this.holes.find(item => item.id === this.state.focusedGoalId);
    if (!hole) throw new TacticError('No goals remain');
    return hole;
  }

  private withReplacement(id: GoalId, replacements: readonly Hole[], root: ProofNode): TacticSession {
    const index = this.holes.findIndex((hole) => hole.id === id);
    if (index < 0) throw new TacticError(`Unknown goal #${id}`);
    const holes = [...this.holes.slice(0, index), ...replacements, ...this.holes.slice(index + 1)];
    const focus = replacements[0]?.id ?? holes[index]?.id ?? holes[index - 1]?.id ?? null;
    return new TacticSession(proofState(holes.map((hole) => hole.goal), focus), root, holes, this.rootContext);
  }
}

export function tacticSession(state: ProofStateInput): TacticSession { return TacticSession.fromState(state); }
