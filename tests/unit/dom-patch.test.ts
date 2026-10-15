import { describe, expect, it } from "vitest";
import { patchChildren } from "../../src/modules/core/dom-patch";

const ELEMENT = 1;
const TEXT = 3;

class FakeText {
  nodeType = TEXT;
  parentNode: FakeElement | null = null;

  constructor(readonly nodeValue: string) {}

  cloneNode(): FakeText {
    return new FakeText(this.nodeValue);
  }

  remove(): void {
    if (!this.parentNode) return;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index >= 0) this.parentNode.childNodes.splice(index, 1);
    this.parentNode = null;
  }
}

class FakeElement {
  nodeType = ELEMENT;
  parentNode: FakeElement | null = null;
  childNodes: Array<FakeElement | FakeText> = [];
  attributes: Array<{ name: string; value: string }> = [];

  constructor(
    readonly tagName: string,
    classes: string[] = [],
    attrs: Array<[string, string]> = []
  ) {
    if (classes.length) this.attributes.push({ name: "class", value: classes.join(" ") });
    for (const [name, value] of attrs) this.attributes.push({ name, value });
  }

  get classList(): string[] {
    const value = this.getAttribute("class");
    return value ? value.split(/\s+/).filter(Boolean) : [];
  }

  getAttribute(name: string): string | null {
    return this.attributes.find((a) => a.name === name)?.value ?? null;
  }

  setAttribute(name: string, value: string): void {
    const found = this.attributes.find((a) => a.name === name);
    if (found) found.value = value;
    else this.attributes.push({ name, value });
  }

  hasAttribute(name: string): boolean {
    return this.attributes.some((a) => a.name === name);
  }

  removeAttribute(name: string): void {
    const index = this.attributes.findIndex((a) => a.name === name);
    if (index >= 0) this.attributes.splice(index, 1);
  }

  appendChild(node: FakeElement | FakeText): void {
    const current = node.parentNode;
    if (current) current.childNodes.splice(current.childNodes.indexOf(node), 1);
    node.parentNode = this;
    this.childNodes.push(node);
  }

  replaceChild(newNode: FakeElement | FakeText, oldNode: FakeElement | FakeText): FakeNode {
    const index = this.childNodes.indexOf(oldNode);
    if (index < 0) throw new Error("NotFoundError: node is not a child");
    oldNode.parentNode = null;
    if (newNode.parentNode) newNode.parentNode.appendChild(newNode);
    newNode.parentNode = this;
    this.childNodes[index] = newNode;
    return oldNode;
  }

  cloneNode(deep = false): FakeElement {
    const clone = new FakeElement(this.tagName);
    clone.attributes = this.attributes.map((a) => ({ ...a }));
    if (deep) for (const child of this.childNodes) clone.appendChild(child.cloneNode(true));
    return clone;
  }

  remove(): void {
    if (!this.parentNode) return;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index >= 0) this.parentNode.childNodes.splice(index, 1);
    this.parentNode = null;
  }
}

type FakeNode = FakeElement | FakeText;

function txt(value: string): FakeText {
  return new FakeText(value);
}

function el(
  tagName: string,
  classes: string[] = [],
  attrs: Array<[string, string]> = [],
  children: FakeNode[] = []
): FakeElement {
  const node = new FakeElement(tagName, classes, attrs);
  for (const child of children) node.appendChild(child);
  return node;
}

/** The shape the app uses: a wrapper root whose CHILDREN are patched, so the root's
    own attributes stay under app control. */
function wrap(...children: FakeNode[]): FakeElement {
  return el("div", [], [], children);
}

function patch(live: FakeElement, fresh: FakeElement): void {
  patchChildren(live as unknown as Element, fresh as unknown as Element);
}

/** Stable rendering of a tree used to compare expected layouts. */
function dump(node: FakeNode): string {
  if (node.nodeType === TEXT) return (node as FakeText).nodeValue;
  const element = node as FakeElement;
  const classes = element.getAttribute("class");
  const attrs = element.attributes
    .filter((a) => a.name !== "class")
    .map((a) => ` ${a.name}="${a.value}"`)
    .join("");
  const children = element.childNodes.map(dump).join("");
  return `<${element.tagName}${classes ? ` ${classes}` : ""}${attrs}>${children}</${element.tagName}>`;
}

/** A small stand-in for the bar: portrait image, HP bar, item slots. */
function bar(hpPct: string, hpExtraClass = "", slots = ["a"]): FakeElement {
  return wrap(
    el(
      "div",
      ["ph-portrait"],
      [],
      [
        el("img", ["ph-portrait-img"], [["src", "vulpix.png"]]),
        el("div", ["ph-hp-fill", hpExtraClass].filter(Boolean), [["style", `--ph-pct:${hpPct}`]])
      ]
    ),
    el(
      "div",
      ["ph-inv-grid"],
      [],
      slots.map((id) => el("div", ["ph-inv-slot"], [["data-item-id", id]]))
    )
  );
}

function first(portrait: FakeElement, index: number): FakeElement {
  return portrait.childNodes[index] as FakeElement;
}

describe("patchChildren", () => {
  it("reuses every node when the trees already match", () => {
    const live = bar("0.50");
    const before = Array.from(live.childNodes);
    patch(live, bar("0.50"));
    Array.from(live.childNodes).forEach((node, i) => expect(node).toBe(before[i]));
    expect(dump(live)).toBe(dump(bar("0.50")));
  });

  it("updates a changed attribute in place instead of replacing the node", () => {
    const live = bar("0.50");
    const portrait = live.childNodes[0];
    const hp = first(portrait as FakeElement, 1);
    const img = first(portrait as FakeElement, 0);
    patch(live, bar("0.75"));
    expect(live.childNodes[0]).toBe(portrait);
    expect(first(portrait as FakeElement, 1)).toBe(hp);
    expect(first(portrait as FakeElement, 0)).toBe(img);
    expect(dump(live)).toBe(dump(bar("0.75")));
  });

  it("removes attributes the fresh tree no longer has", () => {
    const live = wrap(
      el(
        "div",
        ["ph-inv-slot"],
        [
          ["data-tooltip-class", "old"],
          ["data-item-id", "a"]
        ]
      )
    );
    patch(live, wrap(el("div", ["ph-inv-slot"], [["data-item-id", "a"]])));
    const slot = live.childNodes[0] as FakeElement;
    expect(slot.hasAttribute("data-tooltip-class")).toBe(false);
    expect(slot.getAttribute("data-item-id")).toBe("a");
    expect(slot.getAttribute("class")).toBe("ph-inv-slot");
  });

  it("adds and removes children while keeping the siblings that did not change", () => {
    const live = bar("0.50", "", ["a", "b"]);
    const img = first(live.childNodes[0] as FakeElement, 0);
    patch(live, bar("0.50", "", ["a", "b", "c"]));
    expect(first(live.childNodes[0] as FakeElement, 0)).toBe(img);
    expect(dump(live)).toBe(dump(bar("0.50", "", ["a", "b", "c"])));

    patch(live, bar("0.50", "", ["a"]));
    expect(first(live.childNodes[0] as FakeElement, 0)).toBe(img);
    expect(dump(live)).toBe(dump(bar("0.50", "", ["a"])));
  });

  it("replaces a node whose signature changed, cascading following shifts", () => {
    const live = bar("0.50", "ph-fill--hp-high", ["a", "b", "c"]);
    const portrait = live.childNodes[0];
    const img = first(portrait as FakeElement, 0);
    patch(live, bar("0.50", "ph-fill--hp-low", ["a"]));
    expect(live.childNodes[0]).toBe(portrait);
    expect(first(portrait as FakeElement, 0)).toBe(img);
    expect(first(portrait as FakeElement, 1).getAttribute("class")).toBe(
      "ph-hp-fill ph-fill--hp-low"
    );
    expect(dump(live)).toBe(dump(bar("0.50", "ph-fill--hp-low", ["a"])));
  });

  it("keeps runtime classes Foundry added at runtime (hover, drag)", () => {
    const diceBtn = el("button", ["ph-dice-btn", "ph-dice-visible"], []);
    const diceInner = el("i", ["fa-solid", "fa-dice-d20"]);
    const live = wrap(el("div", ["ph-portrait-img-wrap"], [], [diceBtn, diceInner]));
    patch(
      live,
      wrap(
        el(
          "div",
          ["ph-portrait-img-wrap"],
          [],
          [el("button", ["ph-dice-btn"], []), el("i", ["fa-solid", "fa-dice-d20"])]
        )
      )
    );

    const wrapNode = live.childNodes[0] as FakeElement;
    expect(wrapNode.childNodes[0]).toBe(diceBtn);
    expect(diceBtn.classList).toContain("ph-dice-visible");
    expect(diceBtn.classList).toContain("ph-dice-btn");
  });

  it("does not count transient drag classes as a structural change", () => {
    const card = el("div", ["ph-power-card", "ph-power-card--dragging"], []);
    const nameSpan = el("span", ["ph-power-card-name"], [], [txt("Tackle")]);
    const live = wrap(card);
    card.appendChild(nameSpan);
    const freshCard = el("div", ["ph-power-card"], []);
    freshCard.appendChild(el("span", ["ph-power-card-name"], [], [txt("Tackle")]));
    patch(live, wrap(freshCard));

    const after = live.childNodes[0] as FakeElement;
    expect(after).toBe(card);
    expect(after.childNodes[0]).toBe(nameSpan);
    expect(after.classList).toContain("ph-power-card--dragging");
    expect(after.classList).toEqual(["ph-power-card", "ph-power-card--dragging"]);
  });

  it("preserves Foundry's runtime tooltip wiring and swaps the tooltip content", () => {
    const live = wrap(
      el(
        "div",
        ["ph-inv-slot"],
        [
          ["data-tooltip-html", "old"],
          ["aria-describedby", "tooltip"]
        ]
      )
    );
    patch(
      live,
      wrap(
        el(
          "div",
          ["ph-inv-slot"],
          [
            ["data-tooltip-class", "dnd5e-tooltip"],
            ["data-tooltip-html", "new"]
          ]
        )
      )
    );
    const slot = live.childNodes[0] as FakeElement;
    expect(slot.getAttribute("data-tooltip-html")).toBe("new");
    expect(slot.getAttribute("data-tooltip-class")).toBe("dnd5e-tooltip");
    expect(slot.getAttribute("aria-describedby")).toBe("tooltip");
  });

  it("swaps a whole subtree when the mode changed (trainer vs pokemon)", () => {
    const live = wrap(el("div", ["bar-inner--trainer"], [], [el("b", ["x"])]));
    patch(live, wrap(el("div", ["bar-inner--pokemon"], [], [el("i", ["y"])])));
    expect(dump(live)).toBe(dump(wrap(el("div", ["bar-inner--pokemon"], [], [el("i", ["y"])]))));
  });

  it("replaces a node when its tag changed", () => {
    const live = wrap(el("button", ["ph-min-btn"], [], [txt("x")]));
    patch(live, wrap(el("div", ["ph-min-btn"], [], [txt("x")])));
    expect(live.childNodes[0].nodeType).toBe(ELEMENT);
    expect((live.childNodes[0] as FakeElement).tagName).toBe("div");
  });

  it("only touches the leaf that changed, keeping ancestors intact", () => {
    const live = bar("0.50");
    const invGridBefore = live.childNodes[1];
    const portraitBefore = live.childNodes[0];
    patch(live, bar("0.66"));
    expect(live.childNodes[0]).toBe(portraitBefore);
    expect(live.childNodes[1]).toBe(invGridBefore);
    expect(first(portraitBefore as FakeElement, 1).getAttribute("style")).toBe("--ph-pct:0.66");
  });
});
