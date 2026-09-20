import { Term } from '../syntax/ast';
import { shift } from '../kernel/reduction';
import { MetaContext, MetaRef, coreTerm, metaTerm } from './metavariable/meta';

export type UnificationTerm = Term | MetaRef;

export function uApp(fn: UnificationTerm, arg: UnificationTerm): UnificationTerm {
  return { kind: 'App', fn: fn as Term, arg: arg as Term };
}

export class UnificationError extends Error {
  constructor(message: string) { super(message); this.name = 'UnificationError'; }
}

export function unify(left: UnificationTerm, right: UnificationTerm, context: MetaContext): MetaContext {
  return unifyAtDepth(left, right, context, 0);
}

function unifyAtDepth(left: UnificationTerm, right: UnificationTerm, context: MetaContext, binderDepth: number): MetaContext {
  const a = prune(left, context, binderDepth);
  const b = prune(right, context, binderDepth);
  const assign = (variable: MetaRef, value: UnificationTerm): MetaContext => {
    // Inferring root-scope assignments from binder-local terms requires a
    // binder-aware solver. Keep this unsupported case explicit and immutable.
    if (binderDepth > 0) throw new UnificationError(`Cannot infer metavariable ?m${variable.id} under a binder`);
    return assignFromTerm(variable, value, context);
  };
  if (a.kind === 'meta') {
    if (b.kind === 'meta' && a.id === b.id) return context;
    return assign(a, b);
  }
  if (b.kind === 'meta') return assign(b, a);
  return unifyCore(a, b, context, binderDepth);
}

export function toCoreTerm(term: UnificationTerm, context: MetaContext): Term {
  const resolved = prune(term, context);
  if (resolved.kind === 'meta') throw new UnificationError(`Unassigned metavariable ?m${resolved.id}`);
  return materializeCore(resolved, context);
}

function materializeCore(term: Term, context: MetaContext, binderDepth = 0): Term {
  const nested = (value: Term, depth = binderDepth): Term => {
    const candidate = value as UnificationTerm;
    // Assignments live in the metavariable's original local scope. Lift their
    // free variables across binders surrounding this occurrence.
    if (candidate.kind === 'meta') return shift(toCoreTerm(candidate, context), depth);
    return materializeCore(candidate, context, depth);
  };
  switch (term.kind) {
    case 'Type': case 'Nat': case 'Zero': case 'Var': return term;
    case 'Pi': return { ...term, domain: nested(term.domain), body: nested(term.body, binderDepth + 1) };
    case 'Lambda': return { ...term, domain: nested(term.domain), body: nested(term.body, binderDepth + 1) };
    case 'App': return { ...term, fn: nested(term.fn), arg: nested(term.arg) };
    case 'Succ': return { ...term, value: nested(term.value) };
    case 'NatRec': return { ...term, motive: nested(term.motive), zeroCase: nested(term.zeroCase), succCase: nested(term.succCase), scrutinee: nested(term.scrutinee) };
    case 'Eq': return { ...term, type: nested(term.type), left: nested(term.left), right: nested(term.right) };
    case 'Refl': return { ...term, type: nested(term.type), value: nested(term.value) };
    case 'EqRec': return { ...term, motive: nested(term.motive), reflCase: nested(term.reflCase), left: nested(term.left), right: nested(term.right), equality: nested(term.equality) };
  }
}

export function substituteUnification(body: UnificationTerm, replacement: UnificationTerm, depth = 0): UnificationTerm {
  if (body.kind === 'meta') return body;
  switch (body.kind) {
    case 'Var':
      if (body.index === depth) return shiftUnification(replacement, depth);
      if (body.index > depth) return { ...body, index: body.index - 1 };
      return body;
    case 'Type': case 'Nat': case 'Zero': return body;
    case 'Pi': return { ...body, domain: substituteUnification(body.domain, replacement, depth) as Term, body: substituteUnification(body.body, replacement, depth + 1) as Term };
    case 'Lambda': return { ...body, domain: substituteUnification(body.domain, replacement, depth) as Term, body: substituteUnification(body.body, replacement, depth + 1) as Term };
    case 'App': return { ...body, fn: substituteUnification(body.fn, replacement, depth) as Term, arg: substituteUnification(body.arg, replacement, depth) as Term };
    case 'Succ': return { ...body, value: substituteUnification(body.value, replacement, depth) as Term };
    case 'NatRec': return { ...body, motive: substituteUnification(body.motive, replacement, depth) as Term, zeroCase: substituteUnification(body.zeroCase, replacement, depth) as Term, succCase: substituteUnification(body.succCase, replacement, depth) as Term, scrutinee: substituteUnification(body.scrutinee, replacement, depth) as Term };
    case 'Eq': return { ...body, type: substituteUnification(body.type, replacement, depth) as Term, left: substituteUnification(body.left, replacement, depth) as Term, right: substituteUnification(body.right, replacement, depth) as Term };
    case 'Refl': return { ...body, type: substituteUnification(body.type, replacement, depth) as Term, value: substituteUnification(body.value, replacement, depth) as Term };
    case 'EqRec': return { ...body, motive: substituteUnification(body.motive, replacement, depth) as Term, reflCase: substituteUnification(body.reflCase, replacement, depth) as Term, left: substituteUnification(body.left, replacement, depth) as Term, right: substituteUnification(body.right, replacement, depth) as Term, equality: substituteUnification(body.equality, replacement, depth) as Term };
  }
}

function shiftUnification(term: UnificationTerm, amount: number, cutoff = 0): UnificationTerm {
  if (term.kind === 'meta') return term;
  switch (term.kind) {
    case 'Var': return { ...term, index: term.index >= cutoff ? term.index + amount : term.index };
    case 'Type': case 'Nat': case 'Zero': return term;
    case 'Pi': return { ...term, domain: shiftUnification(term.domain, amount, cutoff) as Term, body: shiftUnification(term.body, amount, cutoff + 1) as Term };
    case 'Lambda': return { ...term, domain: shiftUnification(term.domain, amount, cutoff) as Term, body: shiftUnification(term.body, amount, cutoff + 1) as Term };
    case 'App': return { ...term, fn: shiftUnification(term.fn, amount, cutoff) as Term, arg: shiftUnification(term.arg, amount, cutoff) as Term };
    case 'Succ': return { ...term, value: shiftUnification(term.value, amount, cutoff) as Term };
    case 'NatRec': return { ...term, motive: shiftUnification(term.motive, amount, cutoff) as Term, zeroCase: shiftUnification(term.zeroCase, amount, cutoff) as Term, succCase: shiftUnification(term.succCase, amount, cutoff) as Term, scrutinee: shiftUnification(term.scrutinee, amount, cutoff) as Term };
    case 'Eq': return { ...term, type: shiftUnification(term.type, amount, cutoff) as Term, left: shiftUnification(term.left, amount, cutoff) as Term, right: shiftUnification(term.right, amount, cutoff) as Term };
    case 'Refl': return { ...term, type: shiftUnification(term.type, amount, cutoff) as Term, value: shiftUnification(term.value, amount, cutoff) as Term };
    case 'EqRec': return { ...term, motive: shiftUnification(term.motive, amount, cutoff) as Term, reflCase: shiftUnification(term.reflCase, amount, cutoff) as Term, left: shiftUnification(term.left, amount, cutoff) as Term, right: shiftUnification(term.right, amount, cutoff) as Term, equality: shiftUnification(term.equality, amount, cutoff) as Term };
  }
}

function assignFromTerm(variable: MetaRef, value: UnificationTerm, context: MetaContext): MetaContext {
  const resolved = prune(value, context);
  if (resolved.kind === 'meta') return context.assign(variable.id, metaTerm(resolved.id));
  if (occurs(variable.id, resolved, context)) throw new UnificationError(`Occurs check failed: ?m${variable.id} occurs in its assignment`);
  return context.assign(variable.id, coreTerm(resolved));
}

function prune(term: UnificationTerm, context: MetaContext, binderDepth = 0): UnificationTerm {
  if (term.kind !== 'meta') return term;
  const resolved = context.resolve(term.id);
  if (resolved.kind === 'meta') return resolved;
  return binderDepth === 0 ? resolved.term : shiftUnification(resolved.term, binderDepth);
}

function occurs(id: number, term: UnificationTerm, context: MetaContext): boolean {
  const resolved = prune(term, context);
  if (resolved.kind === 'meta') return resolved.id === id;
  switch (resolved.kind) {
    case 'Type': case 'Nat': case 'Zero': case 'Var': return false;
    case 'Pi': case 'Lambda': return occurs(id, resolved.domain, context) || occurs(id, resolved.body, context);
    case 'App': return occurs(id, resolved.fn, context) || occurs(id, resolved.arg, context);
    case 'Succ': return occurs(id, resolved.value, context);
    case 'NatRec': return occurs(id, resolved.motive, context) || occurs(id, resolved.zeroCase, context) || occurs(id, resolved.succCase, context) || occurs(id, resolved.scrutinee, context);
    case 'Eq': return occurs(id, resolved.type, context) || occurs(id, resolved.left, context) || occurs(id, resolved.right, context);
    case 'Refl': return occurs(id, resolved.type, context) || occurs(id, resolved.value, context);
    case 'EqRec': return occurs(id, resolved.motive, context) || occurs(id, resolved.reflCase, context) || occurs(id, resolved.left, context) || occurs(id, resolved.right, context) || occurs(id, resolved.equality, context);
  }
}

function unifyCore(left: Term, right: Term, context: MetaContext, binderDepth: number): MetaContext {
  if (left.kind !== right.kind) throw new UnificationError(`Cannot unify ${left.kind} with ${right.kind}`);
  const nested = (a: UnificationTerm, b: UnificationTerm, next: MetaContext): MetaContext => unifyAtDepth(a, b, next, binderDepth);
  switch (left.kind) {
    case 'Type': case 'Nat': case 'Zero': return context;
    case 'Var':
      if (left.index !== (right as typeof left).index) throw new UnificationError(`Cannot unify variables #${left.index} and #${(right as typeof left).index}`);
      return context;
    case 'Pi': case 'Lambda': {
      const r = right as typeof left;
      const next = nested(left.domain, r.domain, context);
      return unifyAtDepth(left.body, r.body, next, binderDepth + 1);
    }
    case 'App': {
      const r = right as typeof left;
      return nested(left.arg, r.arg, nested(left.fn, r.fn, context));
    }
    case 'Succ': return nested(left.value, (right as typeof left).value, context);
    case 'NatRec': {
      const r = right as typeof left;
      let next = nested(left.motive, r.motive, context);
      next = nested(left.zeroCase, r.zeroCase, next);
      next = nested(left.succCase, r.succCase, next);
      return nested(left.scrutinee, r.scrutinee, next);
    }
    case 'Eq': {
      const r = right as typeof left;
      let next = nested(left.type, r.type, context);
      next = nested(left.left, r.left, next);
      return nested(left.right, r.right, next);
    }
    case 'Refl': {
      const r = right as typeof left;
      return nested(left.value, r.value, nested(left.type, r.type, context));
    }
    case 'EqRec': {
      const r = right as typeof left;
      let next = nested(left.motive, r.motive, context);
      next = nested(left.reflCase, r.reflCase, next);
      next = nested(left.left, r.left, next);
      next = nested(left.right, r.right, next);
      return nested(left.equality, r.equality, next);
    }
  }
}
