import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

function decode(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// Exercise the actual app handlers with a small DOM adapter. Layout, focus
// rendering, and browser input behavior remain browser-level concerns.
class Control {
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Array<() => void>>();
  value = "";
  constructor(readonly attributes: Record<string, string>, readonly owner: TestRoot) {
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("data-")) this.dataset[name.slice(5)] = value;
    }
    this.value = attributes.value ?? "";
  }
  addEventListener(event: string, callback: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), callback]);
  }
  emit(event: string): void { for (const callback of this.listeners.get(event) ?? []) callback(); }
  focus(): void { this.owner.focused = this.attributes.id; }
  select(): void {}
}

class TestRoot {
  html = "";
  controls: Control[] = [];
  focused?: string;
  set innerHTML(html: string) {
    this.html = html;
    this.controls = [];
    for (const match of html.matchAll(/<(button|input|textarea)\b([^>]*)>/g)) {
      const attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [entry[1], decode(entry[2])]));
      const control = new Control(attributes, this);
      if (match[1] === "textarea") {
        const start = match.index! + match[0].length;
        control.value = decode(html.slice(start, html.indexOf("</textarea>", start)));
      }
      this.controls.push(control);
    }
  }
  querySelector(selector: string): Control | undefined {
    return this.controls.find((control) => control.attributes.id === selector.slice(1));
  }
  querySelectorAll(selector: string): Control[] {
    return this.controls.filter((control) => selector.slice(1, -1) in control.attributes);
  }
  control(id: string): Control {
    const control = this.querySelector(`#${id}`);
    assert.ok(control, `Missing control: ${id}`);
    return control;
  }
  selectExercise(id: string): void {
    const button = this.controls.find((control) => control.dataset.exercise === id);
    assert.ok(button);
    button.emit("click");
  }
}

function loadApp(): TestRoot {
  const root = new TestRoot();
  const filename = require.resolve("../src/ui/app");
  const nativeRequire = createRequire(filename);
  runInNewContext(readFileSync(filename, "utf8"), {
    exports: {},
    require: (name: string) => {
      if (name.endsWith(".css")) return {};
      if (name === "./kv-cache-lab") return { renderKVCacheLab() { assert.fail("Unexpected lab navigation"); } };
      return nativeRequire(name);
    },
    document: { querySelector: () => root },
    window: { addEventListener() {} },
    location: { hash: "" },
  });
  return root;
}

function enterScript(root: TestRoot, source: string): void {
  const input = root.control("proof-script");
  input.value = source;
  input.emit("input");
  root.control("run-script-button").emit("click");
}

test("Run script uses the real engine and records completion only on full success", () => {
  const root = loadApp();
  root.selectExercise("numbers.identity");
  enterScript(root, "intro\nrfl\nunknown_tactic");
  assert.match(root.html, /Line 3: There are no goals left/);
  assert.equal(root.control("proof-script").value, "intro\nrfl\nunknown_tactic");
  assert.equal(root.control("proof-script").attributes["aria-invalid"], "true");
  assert.equal(root.control("tactic-input").attributes["aria-invalid"], "false");
  assert.equal(root.html.includes('id="tactic-feedback"'), false);
  assert.equal(root.controls.find((control) => control.dataset.exercise === "numbers.identity")?.attributes.class.includes("completed"), false);
  enterScript(root, "intro\nrfl");
  assert.match(root.html, /Accepted by the real Kernel/);
  assert.equal(root.controls.find((control) => control.dataset.exercise === "numbers.identity")?.attributes.class.includes("completed"), true);
});

test("script source and diagnostics are escaped before rendering", () => {
  const root = loadApp();
  const source = "</textarea><img src=x onerror=alert(1)>";
  enterScript(root, source);
  assert.equal(root.control("proof-script").value, source);
  assert.equal(root.html.includes("<img"), false);
  assert.match(root.html, /&lt;\/textarea&gt;&lt;img/);
  assert.match(root.html, /Line 1: Unknown tactic:/);
});

test("partial scripts retain manual tactic drafts and can be finished interactively", () => {
  const root = loadApp();
  root.selectExercise("numbers.identity");
  root.control("tactic-input").value = "rfl";
  root.control("tactic-input").emit("input");
  enterScript(root, "intro");
  assert.equal(root.control("proof-script").value, "");
  assert.equal(root.control("tactic-input").value, "rfl");
  assert.equal(root.focused, "proof-script");
  root.control("apply-button").emit("click");
  assert.match(root.html, /Accepted by the real Kernel/);
});

test("script drafts survive manual tactics and clear when selecting another exercise", () => {
  const root = loadApp();
  root.selectExercise("numbers.identity");
  root.control("proof-script").value = "-- Finish\nrfl";
  root.control("proof-script").emit("input");
  root.control("tactic-input").value = "intro";
  root.control("apply-button").emit("click");
  assert.equal(root.control("proof-script").value, "-- Finish\nrfl");
  root.selectExercise("numbers.zero_eq_zero");
  assert.equal(root.control("proof-script").value, "");
});
