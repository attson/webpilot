/**
 * Element metadata shared by `takeSnapshot` and `findElements` so the two
 * cannot drift on what counts as interactive or how an element is named.
 */
import { lookupUid } from "./uid-cache";

export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "textarea",
  "select",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=tab]",
  "[contenteditable=true]",
  "[data-testid]",
].join(", ");

export function elText(el: Element): string {
  const t = (el as HTMLElement).innerText ?? el.textContent ?? "";
  return t.trim().slice(0, 80);
}

export function elRole(el: Element): string {
  return el.getAttribute("role") || el.tagName.toLowerCase();
}

export function elName(el: Element): string {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder;
  const name = el.getAttribute("name");
  if (name) return name;
  const text = elText(el);
  if (text) return text;
  return "";
}

export function bounds(el: Element): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

/**
 * Resolves a tool argument that may address an element either by CSS selector
 * or by a uid from `takeSnapshot` / `findElements`.
 */
export function resolveTarget(
  args: Record<string, unknown>,
  keys: { selector: string; uid: string },
  tool: string
): Element {
  const uid = args[keys.uid];
  if (typeof uid === "string" && uid) {
    const el = lookupUid(uid);
    if (!el) throw new Error(`${tool}: stale snapshot — uid ${uid} no longer resolves`);
    return el;
  }
  const selector = args[keys.selector];
  if (typeof selector === "string" && selector) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`${tool}: target not found for selector ${selector}`);
    return el;
  }
  throw new Error(`${tool}: target not found — pass ${keys.selector} or ${keys.uid}`);
}
