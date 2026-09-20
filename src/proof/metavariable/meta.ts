import { Term } from '../../syntax/ast';

export interface MetaVariable { readonly id: number; readonly scopeDepth: number; readonly type?: Term; }
export interface MetaRef { readonly kind: 'meta'; readonly id: number; }
export interface CoreTermRef { readonly kind: 'term'; readonly term: Term; }
export type MetaTerm = MetaRef | CoreTermRef;
export function metaTerm(id: number): MetaRef { return { kind: 'meta', id }; }
export function coreTerm(term: Term): CoreTermRef { return { kind: 'term', term }; }

export class MetaVariableError extends Error {
  constructor(message: string) { super(message); this.name = 'MetaVariableError'; }
}

/** Immutable proof-engine state; metavariables never become Core Term nodes. */
export class MetaContext {
  readonly variables: readonly MetaVariable[];
  readonly assignments: ReadonlyMap<number, MetaTerm>;
  private readonly nextId: number;

  private constructor(variables: readonly MetaVariable[], assignments: ReadonlyMap<number, MetaTerm>, nextId: number) {
    this.variables = [...variables];
    this.assignments = new Map(assignments);
    this.nextId = nextId;
  }

  static empty(): MetaContext { return new MetaContext([], new Map(), 0); }

  create(scopeDepth: number, type?: Term): { readonly context: MetaContext; readonly variable: MetaVariable; readonly term: MetaRef } {
    if (!Number.isInteger(scopeDepth) || scopeDepth < 0) throw new MetaVariableError(`Invalid metavariable scope depth: ${scopeDepth}`);
    if (type) validateTermScope(type, scopeDepth);
    const variable: MetaVariable = { id: this.nextId, scopeDepth, type };
    return { context: new MetaContext([...this.variables, variable], this.assignments, this.nextId + 1), variable, term: metaTerm(variable.id) };
  }

  lookup(id: number): MetaVariable {
    const variable = this.variables.find((candidate) => candidate.id === id);
    if (!variable) throw new MetaVariableError(`Unknown metavariable ?m${id}`);
    return variable;
  }

  assignment(id: number): MetaTerm | undefined { this.lookup(id); return this.assignments.get(id); }

  assign(id: number, value: MetaTerm): MetaContext {
    const variable = this.lookup(id);
    // Assignments are single-use; branch from an unassigned context to explore alternatives.
    if (this.assignments.has(id)) throw new MetaVariableError(`Metavariable ?m${id} is already assigned`);
    const resolved = resolveMetaTerm(this, value, new Set([id]));
    if (resolved.kind === 'meta' && resolved.id === id) throw new MetaVariableError(`Cannot assign ?m${id} to itself`);
    validateAssignmentScope(variable, value, this);
    const assignments = new Map(this.assignments);
    assignments.set(id, value);
    return new MetaContext(this.variables, assignments, this.nextId);
  }

  instantiate(value: MetaTerm): Term {
    const resolved = resolveMetaTerm(this, value, new Set());
    if (resolved.kind === 'meta') throw new MetaVariableError(`Unassigned metavariable ?m${resolved.id}`);
    return resolved.term;
  }

  resolve(id: number): MetaTerm { this.lookup(id); return resolveMetaTerm(this, metaTerm(id), new Set()); }
}

function validateAssignmentScope(variable: MetaVariable, value: MetaTerm, context: MetaContext): void {
  if (value.kind === 'meta') {
    const target = context.lookup(value.id);
    if (target.scopeDepth > variable.scopeDepth) throw new MetaVariableError(`Scope escape: ?m${variable.id} has scope ${variable.scopeDepth}, but ?m${target.id} requires scope ${target.scopeDepth}`);
    return;
  }
  validateTermScope(value.term, variable.scopeDepth);
}

/** Ensure every free de Bruijn variable fits the metavariable's local scope. */
function validateTermScope(term: Term, scopeDepth: number, binderDepth = 0): void {
  switch (term.kind) {
    case 'Type': case 'Nat': case 'Zero': return;
    case 'Var':
      if (term.index >= scopeDepth + binderDepth) throw new MetaVariableError(`Scope escape: variable #${term.index} is outside scope depth ${scopeDepth}`);
      return;
    case 'Pi': case 'Lambda':
      validateTermScope(term.domain, scopeDepth, binderDepth);
      validateTermScope(term.body, scopeDepth, binderDepth + 1);
      return;
    case 'App':
      validateTermScope(term.fn, scopeDepth, binderDepth);
      validateTermScope(term.arg, scopeDepth, binderDepth);
      return;
    case 'Succ': validateTermScope(term.value, scopeDepth, binderDepth); return;
    case 'NatRec':
      validateTermScope(term.motive, scopeDepth, binderDepth); validateTermScope(term.zeroCase, scopeDepth, binderDepth);
      validateTermScope(term.succCase, scopeDepth, binderDepth); validateTermScope(term.scrutinee, scopeDepth, binderDepth); return;
    case 'Eq':
      validateTermScope(term.type, scopeDepth, binderDepth); validateTermScope(term.left, scopeDepth, binderDepth); validateTermScope(term.right, scopeDepth, binderDepth); return;
    case 'Refl':
      validateTermScope(term.type, scopeDepth, binderDepth); validateTermScope(term.value, scopeDepth, binderDepth); return;
    case 'EqRec':
      validateTermScope(term.motive, scopeDepth, binderDepth); validateTermScope(term.reflCase, scopeDepth, binderDepth);
      validateTermScope(term.left, scopeDepth, binderDepth); validateTermScope(term.right, scopeDepth, binderDepth); validateTermScope(term.equality, scopeDepth, binderDepth); return;
  }
}

function resolveMetaTerm(context: MetaContext, value: MetaTerm, visiting: ReadonlySet<number>): MetaTerm {
  if (value.kind === 'term') return value;
  context.lookup(value.id);
  if (visiting.has(value.id)) throw new MetaVariableError(`Cyclic metavariable assignment involving ?m${value.id}`);
  const assignment = context.assignment(value.id);
  if (!assignment) return value;
  return resolveMetaTerm(context, assignment, new Set([...visiting, value.id]));
}
