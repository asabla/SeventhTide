export function select(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing interface element: " + id);
  return node;
}

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
