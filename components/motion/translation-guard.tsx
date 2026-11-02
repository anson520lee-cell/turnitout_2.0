"use client";
import { useEffect } from "react";

/**
 * Keeps the page alive when the browser translates it.
 *
 * Safari's and Chrome's "Translate this page" swap every piece of text for a <font> element. React still holds the
 * old text nodes, so the next time it removes or inserts next to one (a button changing from "Use this" to "Keep mine"
 * after a click) the browser throws NotFoundError and the whole page falls over to the error screen. A visitor whose
 * browser translates English pages into Chinese sees exactly that: the click "does nothing" and the panel is gone.
 *
 * The usual remedy (React issue #11538): when the node is no longer where React expects it, skip the removal, and put
 * a new node at the end of its parent instead of throwing. Nothing changes for a page that is not translated.
 */
export function TranslationGuard() {
  useEffect(() => {
    const proto = Node.prototype as Node & { __translationGuard?: true };
    if (proto.__translationGuard) return;
    proto.__translationGuard = true;

    const removeChild = proto.removeChild;
    proto.removeChild = function <T extends Node>(this: Node, child: T): T {
      if (child.parentNode !== this) return child;
      return removeChild.call(this, child) as T;
    };

    const insertBefore = proto.insertBefore;
    proto.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
      if (reference && reference.parentNode !== this) return insertBefore.call(this, node, null) as T;
      return insertBefore.call(this, node, reference) as T;
    };
  }, []);
  return null;
}
