import assert from 'node:assert/strict';
import test from 'node:test';
import { elaborate } from '../src/elaborator/elaborate';
import { normalize } from '../src/kernel/reduction';
import { check } from '../src/kernel/typecheck';
import { parse } from '../src/parser/parser';
import { initialProofState } from '../src/proof/state';
import { tacticSession } from '../src/proof/tactic';
import { Nat, Type, Zero, app, pi, variable } from '../src/syntax/ast';

test('anonymous intros keep the outer local available to textual exact', () => {
  const target = pi(Type, pi(variable(0), Type));
  const initial = tacticSession(initialProofState(target));
  const session = initial.intro().intro();
  const names = session.currentGoal()!.context.map(entry => entry.name);
  const proof = session.exact(elaborate(parse('x'), names)).proof();
  check([], proof, target);
  assert.deepEqual(normalize(app(app(proof, Nat), Zero)), Nat);
  assert.deepEqual(names, ['x', 'x1']);
  assert.equal(initial.currentGoal()!.context.length, 0);
});

test('anonymous intros skip already occupied generated names', () => {
  const target = pi(Nat, pi(Nat, pi(Nat, Nat), 'x1'), 'x');
  const session = tacticSession(initialProofState(target)).intro().intro().intro();
  const names = session.currentGoal()!.context.map(entry => entry.name);
  assert.deepEqual(names, ['x', 'x1', 'x2']);
  const proof = session.exact(elaborate(parse('x'), names)).proof();
  check([], proof, target);
});

test('explicit binder names retain their source shadowing behavior', () => {
  const target = pi(Type, pi(variable(0), variable(1), 'x'), 'x');
  const session = tacticSession(initialProofState(target)).intro().intro();
  const names = session.currentGoal()!.context.map(entry => entry.name);
  assert.deepEqual(names, ['x', 'x']);
  const proof = session.exact(elaborate(parse('x'), names)).proof();
  check([], proof, target);
});
