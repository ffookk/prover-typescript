import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

type Handler = (event: { target: { value: string } }) => void;
function mountLab() {
  const listeners = new Map<string, Handler>();
  const root = {
    innerHTML: "",
    querySelector(selector: string) {
      return { addEventListener(_type: string, listener: Handler) { listeners.set(selector, listener); } };
    },
    querySelectorAll() {
      return [...this.innerHTML.matchAll(/data-prove="(\d+)"/g)].map((match) => ({
        dataset: { prove: match[1] },
        addEventListener(_type: string, listener: Handler) { listeners.set(`prove-${match[1]}`, listener); },
      }));
    },
  };
  const exports: { renderKVCacheLab?: (root: unknown) => void } = {};
  runInNewContext(readFileSync(join(__dirname, "../src/ui/kv-cache-lab.js"), "utf8"), {
    exports,
    require: (name: string) => { assert.equal(name, "./kv-cache-lab.css"); },
    window: {},
  });
  exports.renderKVCacheLab!(root);
  return {
    html: () => root.innerHTML,
    change(selector: string, value: number) {
      assert.ok(listeners.has(selector), selector);
      listeners.get(selector)!({ target: { value: String(value) } });
    },
  };
}

function assertMetric(html: string, label: string, expected: number) {
  assert.ok(html.includes(`<span>${label}</span><strong>${expected}</strong>`), `${label} should be ${expected}`);
}

test("KV attention metrics count the new token already included in the diagram", () => {
  const lab = mountLab();
  assert.ok(lab.html().includes("Attention: 5 × 5"));
  assertMetric(lab.html(), "Full attention interactions", 25);
  assertMetric(lab.html(), "Cached next-token interactions", 5);
  assertMetric(lab.html(), "Stored K/V entries", 16);
});

test("KV attention costs follow both prefix boundaries and preserve the old-prefix cache size", () => {
  const lab = mountLab();
  for (const prefix of [1, 16]) {
    lab.change("#kv-length", prefix);
    assertMetric(lab.html(), "Full attention interactions", (prefix + 1) ** 2);
    assertMetric(lab.html(), "Cached next-token interactions", prefix + 1);
    assertMetric(lab.html(), "Stored K/V entries", 4 * prefix);
  }
  lab.change("#kv-layers", 8);
  assertMetric(lab.html(), "Full attention interactions", 289);
  assertMetric(lab.html(), "Cached next-token interactions", 17);
  assertMetric(lab.html(), "Stored K/V entries", 256);
});

test("the completed cost derivation agrees with the next-token metrics", () => {
  const lab = mountLab();
  for (let index = 0; index < 5; index += 1) lab.change(`prove-${index}`, 0);
  assert.ok(lab.html().includes("full : (n + 1)² = 25"));
  assert.ok(lab.html().includes("cached : n + 1 = 5"));
  assert.ok(lab.html().includes("25 for all 5 positions versus 5 interactions for the new query"));
});
