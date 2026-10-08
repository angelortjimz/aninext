if (typeof Element !== "undefined") {
  const stub = (name: string, value: () => void): void => {
    if (!(name in Element.prototype)) {
      Object.defineProperty(Element.prototype, name, { value, configurable: true });
    }
  };
  stub("hasPointerCapture", () => false);
  stub("setPointerCapture", () => undefined);
  stub("releasePointerCapture", () => undefined);
  stub("scrollIntoView", () => undefined);
}
