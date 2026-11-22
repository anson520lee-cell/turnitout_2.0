"use client";
import { useEffect, useRef, useState } from "react";

type Item = { id: string; text: string };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * "On this page" rail for a ProseDoc: built from the document's own section
 * headings once the page is interactive (each gets an id, so its link works),
 * with the section being read marked as you scroll. Shown on wide screens
 * only; it stays hidden until it has something to list.
 */
export function DocIndex() {
  const ref = useRef<HTMLElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const doc = ref.current?.parentElement?.querySelector(".prose-doc");
    if (!doc) return;
    const heads = Array.from(doc.querySelectorAll("h2"));
    if (heads.length < 2) return;
    const used = new Set<string>();
    const list = heads.map((h, i) => {
      let id = h.id || slug(h.textContent ?? "") || `section-${i + 1}`;
      if (used.has(id)) id = `${id}-${i + 1}`;
      used.add(id);
      h.id = id;
      return { id, text: h.textContent ?? "" };
    });
    // the section being read: the last heading above the upper third of the window
    const pick = () => {
      const line = window.innerHeight * 0.32;
      let cur = heads[0].id;
      for (const h of heads) if (h.getBoundingClientRect().top < line) cur = h.id;
      setActive((p) => (p === cur ? p : cur));
    };
    const raf = requestAnimationFrame(() => {
      setItems(list);
      pick();
    });
    const io = new IntersectionObserver(pick, { rootMargin: "-30% 0px -68% 0px" });
    heads.forEach((h) => io.observe(h));
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <nav ref={ref} aria-label="On this page" className="doc-index" data-ready={items.length ? "" : undefined}>
      <p className="doc-index-title">On this page</p>
      <ol>
        {items.map((it, i) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="doc-index-link" aria-current={active === it.id ? "location" : undefined}>
              <span className="nav-idx">{String(i + 1).padStart(2, "0")}</span>
              <span>{it.text}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
