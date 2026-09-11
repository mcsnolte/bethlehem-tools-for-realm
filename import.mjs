import {parseNames} from './core.mjs';

export function readTable(text, delimiter = 'auto') {
  text = text.replace(/^\uFEFF/, '');
  if (delimiter === 'auto') {
    // Inspect separators outside quotes in the first logical record.
    let quote = false;
    let tabs = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quote && text[i + 1] === '"') {
          i++;
          continue;
        }
        quote = !quote;
      } else if (!quote) {
        if (c === '\n' || c === '\r') break;
        if (c === '\t') tabs++;
      }
    }
    delimiter = tabs ? '\t' : ',';
  }

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const finish = () => {
    row.push(cell);
    cell = '';
    closed = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      if (cell || closed) throw Error('Unexpected quote in file. Check the CSV formatting.');
      quoted = true;
    } else if (c === delimiter) {
      finish();
    } else if (c === '\n' || c === '\r') {
      finish();
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (closed) {
      if (!/\s/.test(c)) throw Error('Unexpected text after a quoted CSV field.');
    } else {
      cell += c;
    }
  }
  if (quoted) throw Error('The file has an unclosed quoted field.');
  finish();
  if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

export function suggestMapping(headers) {
  const norm = s => s.trim().toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ');
  const find = names => headers.findIndex(h => names.includes(norm(h)));
  return {
    given: find(['first name', 'given name', 'firstname', 'given', 'preferred name']),
    family: find(['last name', 'surname', 'family name', 'lastname', 'family']),
    full: find(['full name', 'name', 'label']),
  };
}

export function mappedNames(text, {
  mode = 'split', given = -1, family = -1, full = -1, delimiter = 'auto',
} = {}) {
  const rows = readTable(text, delimiter);
  if (rows.length < 2) throw Error('Add at least one data row beneath the headers.');
  const headers = rows.shift();
  const indices = mode === 'full' ? [full] : [given, family];
  if (indices.some(i => !Number.isInteger(i) || i < 0 || i >= headers.length)) {
    throw Error('Choose a column for each name field.');
  }
  if (mode === 'split' && given === family) {
    throw Error('First name and last name must use different columns.');
  }

  const names = rows.map((r, i) => {
    if (r.length !== headers.length) {
      throw Error(`Data row ${i + 1} has ${r.length} columns; the header has ${headers.length}. Check the separator.`);
    }
    if (mode === 'full') {
      let parsed;
      try {
        parsed = parseNames(r[full]);
      } catch {
        throw Error(`Data row ${i + 1}: map separate name columns for compound names, or use “Surname, Given name”.`);
      }
      if (parsed.length !== 1) {
        throw Error(`Data row ${i + 1}: use exactly one name per full-name cell.`);
      }
      return parsed[0];
    }
    const first = r[given].trim();
    const last = r[family].trim();
    if (!first || !last) throw Error(`Data row ${i + 1} is missing a first or last name.`);
    return {given: first, family: last};
  });

  // Identical names generate identical conditions, but Realm profiles are never deduplicated by name.
  const unique = [...new Map(names.map(n => [
    JSON.stringify([n.given.toLowerCase(), n.family.toLowerCase()]), n,
  ])).values()];
  if (unique.length > 50) {
    throw Error(`This file contains ${unique.length} distinct names. Use a batch of up to 50 for now.`);
  }
  return {names: unique, rows: names.length, duplicates: names.length - unique.length};
}
