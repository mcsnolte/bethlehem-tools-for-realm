import {buildQuery, parseNames} from '../core.mjs';

export const query = () => buildQuery(parseNames('Morgan Example'));
export const reportId = '11111111-2222-3333-4444-555555555555';

export function grid(requested = query(), ids = ['one']) {
  const names = ['IndividualId', 'ContactInfo_Label', 'ContactInfo_FirstName',
    'ContactInfo_PreferredName', 'ContactInfo_LastName'];
  return {
    Settings: {Query: requested, Columns: names.map(Name => ({Name}))},
    Items: ids.map(id => [id, 'Morgan Example', 'Morgan', null, 'Example']),
    TotalCount: ids.length,
    HasMore: false,
  };
}

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
