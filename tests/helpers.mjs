import {buildQuery, parseNames} from '../core.mjs';

export const query = () => buildQuery(parseNames('Morgan Example'));
export function globals(t, replacements) {
  const originals = Object.fromEntries(Object.keys(replacements).map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
  }
  t.after(() => {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}
