/**
 * Deterministic rule evaluator. Pure functions, no I/O, no LLM.
 *
 * Three-valued logic: every node evaluates to pass, fail or missing.
 * Missing data never counts as a pass (spec 8.3).
 */
import {
  isVerifiedSource, type ConditionOutcome, type FieldKey, type Profile, type RuleCondition, type RuleNode,
} from '@digischeme/shared';

export type Tri = 'pass' | 'fail' | 'missing';

export interface NodeEval {
  state: Tri;
  /** Only meaningful when state is 'pass': did every field this pass relied on come from a verified source? */
  verified: boolean;
  matched: ConditionOutcome[];
  failed: ConditionOutcome[];
  missing: FieldKey[];
}

const isCondition = (n: RuleNode): n is RuleCondition => 'field' in n;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Compare a present value against a condition. Returns null when the comparison is not meaningful. */
export function compare(op: RuleCondition['op'], actual: unknown, expected: unknown): boolean | null {
  switch (op) {
    case 'exists':
      return expected === false ? actual === undefined : actual !== undefined;
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) ? expected.includes(actual) : null;
    case 'notIn':
      return Array.isArray(expected) ? !expected.includes(actual) : null;
    case 'between': {
      const a = num(actual);
      if (!Array.isArray(expected) || expected.length !== 2 || a === null) return null;
      const [lo, hi] = [num(expected[0]), num(expected[1])];
      if (lo === null || hi === null) return null;
      return a >= lo && a <= hi; // inclusive on both ends
    }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const a = num(actual);
      const e = num(expected);
      if (a === null || e === null) return null;
      if (op === 'lt') return a < e;
      if (op === 'lte') return a <= e;
      if (op === 'gt') return a > e;
      return a >= e;
    }
  }
}

function evalCondition(c: RuleCondition, profile: Profile): NodeEval {
  const entry = profile[c.field];
  const base = { field: c.field, op: c.op, expected: c.value, label: c.label };
  if (entry === undefined || entry.value === undefined || entry.value === null) {
    return { state: 'missing', verified: false, matched: [], failed: [], missing: [c.field] };
  }
  const outcome: ConditionOutcome = { ...base, actual: entry.value, source: entry.source };
  const ok = compare(c.op, entry.value, c.value);
  if (ok === null) {
    // A value we cannot compare is treated as unknown, never as a pass.
    return { state: 'missing', verified: false, matched: [], failed: [], missing: [c.field] };
  }
  return ok
    ? { state: 'pass', verified: isVerifiedSource(entry.source), matched: [outcome], failed: [], missing: [] }
    : { state: 'fail', verified: false, matched: [], failed: [outcome], missing: [] };
}

const uniq = <T>(xs: T[]): T[] => [...new Set(xs)];

/** True when every leaf field in the subtree is present and from a verified source. */
function subtreeVerified(node: RuleNode, profile: Profile): boolean {
  if (isCondition(node)) return isVerifiedSource(profile[node.field]?.source);
  if ('all' in node) return node.all.every((n) => subtreeVerified(n, profile));
  if ('any' in node) return node.any.every((n) => subtreeVerified(n, profile));
  return subtreeVerified(node.not, profile);
}

export function evaluateNode(node: RuleNode, profile: Profile): NodeEval {
  if (isCondition(node)) return evalCondition(node, profile);

  if ('all' in node) {
    const kids = node.all.map((n) => evaluateNode(n, profile));
    const matched = kids.flatMap((k) => k.matched);
    const failed = kids.flatMap((k) => k.failed);
    const missing = uniq(kids.flatMap((k) => k.missing));
    if (kids.some((k) => k.state === 'fail')) return { state: 'fail', verified: false, matched, failed, missing };
    if (kids.some((k) => k.state === 'missing')) return { state: 'missing', verified: false, matched, failed, missing };
    return { state: 'pass', verified: kids.every((k) => k.verified), matched, failed, missing };
  }

  if ('any' in node) {
    const kids = node.any.map((n) => evaluateNode(n, profile));
    const passing = kids.filter((k) => k.state === 'pass');
    if (passing.length > 0) {
      // One fully verified passing branch is enough to call the group verified.
      const best = passing.find((k) => k.verified) ?? passing[0]!;
      return { state: 'pass', verified: best.verified, matched: best.matched, failed: [], missing: [] };
    }
    const missing = uniq(kids.flatMap((k) => k.missing));
    if (kids.some((k) => k.state === 'missing')) {
      return { state: 'missing', verified: false, matched: [], failed: [], missing };
    }
    return { state: 'fail', verified: false, matched: [], failed: kids.flatMap((k) => k.failed), missing: [] };
  }

  // not: invert pass/fail; unknown stays unknown.
  const inner = evaluateNode(node.not, profile);
  if (inner.state === 'missing') return { ...inner, matched: [], failed: [] };
  const label = node.label;
  const relabel = (o: ConditionOutcome): ConditionOutcome => (label ? { ...o, label } : { ...o, label: `Not: ${o.label}` });
  if (inner.state === 'fail') {
    return {
      state: 'pass',
      verified: subtreeVerified(node.not, profile),
      matched: inner.failed.map(relabel),
      failed: [],
      missing: [],
    };
  }
  return { state: 'fail', verified: false, matched: [], failed: inner.matched.map(relabel), missing: [] };
}

/** Every profile field a rule tree reads. */
export function fieldsUsed(node: RuleNode): FieldKey[] {
  if (isCondition(node)) return [node.field];
  if ('all' in node) return uniq(node.all.flatMap(fieldsUsed));
  if ('any' in node) return uniq(node.any.flatMap(fieldsUsed));
  return fieldsUsed(node.not);
}
