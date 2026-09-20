import { Term, app, lambda, natRec, succ } from '../syntax/ast';

export function shift(term: Term, amount: number, cutoff = 0): Term {
  switch (term.kind) {
    case 'Var': return { ...term, index: term.index >= cutoff ? term.index + amount : term.index };
    case 'Type': case 'Nat': case 'Zero': return term;
    case 'Pi': return { ...term, domain: shift(term.domain, amount, cutoff), body: shift(term.body, amount, cutoff + 1) };
    case 'Lambda': return { ...term, domain: shift(term.domain, amount, cutoff), body: shift(term.body, amount, cutoff + 1) };
    case 'App': return app(shift(term.fn, amount, cutoff), shift(term.arg, amount, cutoff));
    case 'Succ': return succ(shift(term.value, amount, cutoff));
    case 'NatRec': return natRec(shift(term.motive, amount, cutoff), shift(term.zeroCase, amount, cutoff), shift(term.succCase, amount, cutoff), shift(term.scrutinee, amount, cutoff));
    case 'Eq': return { ...term, type: shift(term.type, amount, cutoff), left: shift(term.left, amount, cutoff), right: shift(term.right, amount, cutoff) };
    case 'Refl': return { ...term, type: shift(term.type, amount, cutoff), value: shift(term.value, amount, cutoff) };
    case 'EqRec': return { ...term, motive: shift(term.motive, amount, cutoff), reflCase: shift(term.reflCase, amount, cutoff), left: shift(term.left, amount, cutoff), right: shift(term.right, amount, cutoff), equality: shift(term.equality, amount, cutoff) };
  }
}

export function substitute(body: Term, replacement: Term, depth = 0): Term {
  switch (body.kind) {
    case 'Var':
      if (body.index === depth) return shift(replacement, depth);
      if (body.index > depth) return { ...body, index: body.index - 1 };
      return body;
    case 'Type': case 'Nat': case 'Zero': return body;
    case 'Pi': return { ...body, domain: substitute(body.domain, replacement, depth), body: substitute(body.body, replacement, depth + 1) };
    case 'Lambda': return { ...body, domain: substitute(body.domain, replacement, depth), body: substitute(body.body, replacement, depth + 1) };
    case 'App': return app(substitute(body.fn, replacement, depth), substitute(body.arg, replacement, depth));
    case 'Succ': return succ(substitute(body.value, replacement, depth));
    case 'NatRec': return natRec(substitute(body.motive, replacement, depth), substitute(body.zeroCase, replacement, depth), substitute(body.succCase, replacement, depth), substitute(body.scrutinee, replacement, depth));
    case 'Eq': return { ...body, type: substitute(body.type, replacement, depth), left: substitute(body.left, replacement, depth), right: substitute(body.right, replacement, depth) };
    case 'Refl': return { ...body, type: substitute(body.type, replacement, depth), value: substitute(body.value, replacement, depth) };
    case 'EqRec': return { ...body, motive: substitute(body.motive, replacement, depth), reflCase: substitute(body.reflCase, replacement, depth), left: substitute(body.left, replacement, depth), right: substitute(body.right, replacement, depth), equality: substitute(body.equality, replacement, depth) };
  }
}

export function whnf(term: Term): Term {
  while (true) {
    if (term.kind === 'App' && term.fn.kind === 'Lambda') {
      term = substitute(term.fn.body, term.arg);
      continue;
    }
    if (term.kind === 'NatRec') {
      if (term.scrutinee.kind === 'Zero') {
        term = term.zeroCase;
        continue;
      }
      if (term.scrutinee.kind === 'Succ') {
        term = app(app(term.succCase, term.scrutinee.value), natRec(term.motive, term.zeroCase, term.succCase, term.scrutinee.value));
        continue;
      }
    }
    if (term.kind === 'EqRec') {
      const equality = whnf(term.equality);
      if (equality.kind === 'Refl') {
        term = term.reflCase;
        continue;
      }
      return equality === term.equality ? term : { ...term, equality };
    }
    return term;
  }
}

export function normalize(term: Term): Term {
  const reduced = whnf(term);
  if (reduced.kind === 'App' && reduced.fn.kind === 'Lambda') {
    return normalize(substitute(reduced.fn.body, reduced.arg));
  }
  switch (reduced.kind) {
    case 'Type': case 'Nat': case 'Zero': case 'Var': return reduced;
    case 'Pi': return { ...reduced, domain: normalize(reduced.domain), body: normalize(reduced.body) };
    case 'Lambda': return { ...reduced, domain: normalize(reduced.domain), body: normalize(reduced.body) };
    case 'App': {
      const fn = normalize(reduced.fn);
      const arg = normalize(reduced.arg);
      if (fn.kind === 'Lambda') return normalize(substitute(fn.body, arg));
      return app(fn, arg);
    }
    case 'Succ': return succ(normalize(reduced.value));
    case 'NatRec': {
      if (reduced.scrutinee.kind === 'Zero') return normalize(reduced.zeroCase);
      if (reduced.scrutinee.kind === 'Succ') return normalize(app(app(reduced.succCase, reduced.scrutinee.value), natRec(reduced.motive, reduced.zeroCase, reduced.succCase, reduced.scrutinee.value)));
      return { ...reduced, motive: normalize(reduced.motive), zeroCase: normalize(reduced.zeroCase), succCase: normalize(reduced.succCase), scrutinee: normalize(reduced.scrutinee) };
    }
    case 'Eq': return { ...reduced, type: normalize(reduced.type), left: normalize(reduced.left), right: normalize(reduced.right) };
    case 'Refl': return { ...reduced, type: normalize(reduced.type), value: normalize(reduced.value) };
    case 'EqRec': {
      const equality = normalize(reduced.equality);
      if (equality.kind === 'Refl') return normalize(reduced.reflCase);
      return { ...reduced, motive: normalize(reduced.motive), reflCase: normalize(reduced.reflCase), left: normalize(reduced.left), right: normalize(reduced.right), equality };
    }
  }
}

export function definitionalEqual(left: Term, right: Term): boolean {
  return structuralEqual(normalize(left), normalize(right));
}

export function structuralEqual(left: Term, right: Term): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'Type': case 'Nat': case 'Zero': return true;
    case 'Var': return left.index === (right as typeof left).index;
    case 'Pi': case 'Lambda': {
      const r = right as typeof left;
      return definitionalEqual(left.domain, r.domain) && structuralEqual(left.body, r.body);
    }
    case 'App': { const r = right as typeof left; return structuralEqual(left.fn, r.fn) && structuralEqual(left.arg, r.arg); }
    case 'Succ': return structuralEqual(left.value, (right as typeof left).value);
    case 'NatRec': { const r = right as typeof left; return structuralEqual(left.motive, r.motive) && structuralEqual(left.zeroCase, r.zeroCase) && structuralEqual(left.succCase, r.succCase) && structuralEqual(left.scrutinee, r.scrutinee); }
    case 'Eq': { const r = right as typeof left; return structuralEqual(left.type, r.type) && structuralEqual(left.left, r.left) && structuralEqual(left.right, r.right); }
    case 'Refl': { const r = right as typeof left; return structuralEqual(left.type, r.type) && structuralEqual(left.value, r.value); }
    case 'EqRec': { const r = right as typeof left; return structuralEqual(left.motive, r.motive) && structuralEqual(left.reflCase, r.reflCase) && structuralEqual(left.left, r.left) && structuralEqual(left.right, r.right) && structuralEqual(left.equality, r.equality); }
  }
}
