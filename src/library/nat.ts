import { Term, Nat, Zero, Type, variable, pi, lambda, app, succ, natRec, eq, refl, natLiteral } from '../syntax/ast';

export const add: Term = lambda(Nat,
  lambda(Nat,
    natRec(
      lambda(Nat, Nat),
      variable(0),
      lambda(Nat, lambda(Nat, succ(variable(0)))),
      variable(1)
    ),
    'm'
  ),
  'n'
);

export const addType: Term = pi(Nat, pi(Nat, Nat));

export function addTerm(a: Term, b: Term): Term {
  return app(app(add, a), b);
}

export function natEquality(a: Term, b: Term): Term {
  return eq(Nat, a, b);
}

export function numeral(n: number): Term {
  return natLiteral(n);
}

export const one = numeral(1);
export const two = numeral(2);
export const three = numeral(3);

export const addTwoThree: Term = addTerm(two, three);

export const addTwoThreeProof: Term = refl(Nat, numeral(5));
