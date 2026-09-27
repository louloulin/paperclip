/**
 * Minimal DOM stub covering exactly the surface `ZhCnRuntime` touches.
 * Keeping the runtime on this narrow slice is what lets us test the whole
 * translate/restore cycle in plain Node with no jsdom dependency.
 */
class StubNode {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentElement = null;
  }
  appendChild(child) {
    child.parentElement = this.nodeType === 1 ? this : this.parentElement;
    this.childNodes.push(child);
    return child;
  }
}

export class StubText extends StubNode {
  constructor(value) {
    super(3);
    this.nodeValue = value;
  }
}

export class StubElement extends StubNode {
  constructor(tagName, attributes = {}) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.isContentEditable = attributes.contenteditable === "" || attributes.contenteditable === "true";
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "contenteditable") this.isContentEditable = value === "" || value === "true";
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  addText(value) {
    return this.appendChild(new StubText(value));
  }
  addElement(tagName, attributes, ...children) {
    const child = new StubElement(tagName, attributes);
    this.appendChild(child);
    for (const grandchild of children) child.appendChild(grandchild);
    return child;
  }
}

export class StubDocument {
  constructor() {
    this.body = new StubElement("body");
    this.documentElement = this.body;
  }
}

/** Serialize a subtree back to a string so tests can assert exact round-trips. */
export function serialize(node) {
  if (node.nodeType === 3) return node.nodeValue ?? "";
  const tag = String(node.tagName).toLowerCase();
  const attrs = [...node.attributes.entries()].map(([k, v]) => ` ${k}="${v}"`).join("");
  const inner = node.childNodes.map(serialize).join("");
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs} />`;
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

const VOID_TAGS = new Set(["input", "br", "img", "hr"]);
