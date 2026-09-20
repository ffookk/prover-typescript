import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../src/kernel/reduction';
import { check } from '../src/kernel/typecheck';
import { tacticSession } from '../src/proof/tactic';
import { Nat, Zero, app, lambda, natLiteral, pi, succ, variable } from '../src/syntax/ast';

test('compiled induction preserves an exact outer variable in the zero case', () => {
  const context = [{ name: 'm', type: Nat }, { name: 'n', type: Nat }];
  const session = tacticSession({ goals: [{ context, type: Nat }] });
  const complete = session.induction('n').exact(variable(0, 'm')).exact(variable(2, 'm'));
  const proof = complete.proof();

  check(context.map(entry => entry.type), proof, Nat);
  const closed = lambda(Nat, lambda(Nat, proof, 'n'), 'm');
  assert.deepEqual(normalize(app(app(closed, succ(Zero)), Zero)), succ(Zero));
  assert.equal(session.state.goals.length, 1);
});

test('compiled induction preserves an exact outer variable in the successor case', () => {
  const target = pi(Nat, pi(Nat, Nat, 'n'), 'm');
  const complete = tacticSession({ goals: [{ context: [], type: target }] })
    .intro().intro().induction('n').exact(variable(0, 'm')).exact(variable(2, 'm'));
  const proof = complete.proof();

  check([], proof, target);
  const outer = succ(succ(Zero));
  assert.deepEqual(normalize(app(app(proof, outer), succ(Zero))), outer);
});

test('compiled induction weakens outer variables beneath extra case-local binders', () => {
  const target = pi(Nat, pi(Nat, pi(Nat, Nat, 'k'), 'n'), 'm');
  const complete = tacticSession({ goals: [{ context: [], type: target }] })
    .intro().intro().induction('n')
    .intro().exact(variable(1, 'm'))
    .intro().exact(variable(3, 'm'));
  const proof = complete.proof();

  check([], proof, target);
  const outer = succ(succ(Zero));
  assert.deepEqual(normalize(app(app(app(proof, outer), succ(Zero)), Zero)), outer);
});

test('nested induction preserves outer variables in both base and successor branches', () => {
  const baseTarget = pi(Nat, pi(Nat, pi(Nat, Nat, 'n'), 'm'), 'a');
  const successorTarget = pi(Nat, pi(Nat, pi(Nat, Nat, 'k'), 'n'), 'a');
  const scenarios = [
    {
      name: 'nested base induction',
      target: baseTarget,
      complete: tacticSession({ goals: [{ context: [], type: baseTarget }] })
        .intro().intro().intro().induction('n')
        .induction('m').exact(variable(0, 'a')).exact(variable(2, 'a'))
        .exact(variable(3, 'a')),
    },
    {
      name: 'nested successor induction',
      target: successorTarget,
      complete: tacticSession({ goals: [{ context: [], type: successorTarget }] })
        .intro().intro().induction('n')
        .intro().exact(variable(1, 'a'))
        .intro().induction('k').exact(variable(2, 'a')).exact(variable(4, 'a')),
    },
  ];

  for (const scenario of scenarios) {
    const proof = scenario.complete.proof();
    check([], proof, scenario.target);
    const outer = natLiteral(7);
    for (const first of [0, 1, 2]) {
      for (const second of [0, 1, 2]) {
        const applied = app(app(app(proof, outer), natLiteral(first)), natLiteral(second));
        assert.deepEqual(normalize(applied), outer, scenario.name);
      }
    }
  }
});
