export function parseNames(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  if (!lines.length) throw Error('Enter at least one name.');
  if (lines.length > 50) throw Error('Use up to 50 names in a plain name list.');
  return lines.map((line, i) => {
    let given;
    let family;
    if (line.includes('\t')) {
      const parts = line.split('\t');
      if (parts.length !== 2) throw Error(`Line ${i + 1}: use two columns, given name then surname.`);
      [given, family] = parts;
    } else if (line.includes(',')) {
      const parts = line.split(',');
      if (parts.length !== 2) throw Error(`Line ${i + 1}: use Surname, Given name.`);
      [family, given] = parts;
    } else {
      const parts = line.split(/\s+/);
      if (parts.length !== 2) throw Error(`Line ${i + 1}: for compound names, use Surname, Given name.`);
      [given, family] = parts;
    }
    given = given.trim();
    family = family.trim();
    if (!given || !family) throw Error(`Line ${i + 1}: both parts of the name are required.`);
    return {given, family};
  });
}

export function buildQuery(people) {
  const counts = {};
  const seen = new Set();
  const groups = [];
  function condition(Name, value) {
    const i = counts[Name] || 0;
    counts[Name] = i + 1;
    return {
      Message: '', SubQuery: [], Name, Operator: 0, Values: [value],
      Unit: null, IgnoreYear: false, Id: Name + i,
    };
  }
  for (const person of people) {
    for (const field of ['FirstName', 'PreferredName']) {
      const key = JSON.stringify([person.family.toLowerCase(), field, person.given.toLowerCase()]);
      if (seen.has(key)) continue;
      seen.add(key);
      const group = [condition('LastName', person.family), condition(field, person.given)];
      group.forEach((item, j) => item.vueId = groups.length * 3 + j + 1);
      groups.push(group);
    }
  }
  return {
    Search: 'Individual',
    DisplayColumns: ['LastName0', 'FirstName0', 'PreferredName0'],
    Query: groups,
    ResultType: 9,
    DisplayContactInfo: 1,
    IncludeDeactivated: false,
    IncludeDeceased: false,
    OrderBy: 'entity asc',
    Included: null,
    Excluded: null,
    IsReport: false,
    PersonnelStatuses: null,
    LabelTypes: null,
    CanViewClergyInfo: false,
    CanViewReligiousInfo: false,
    CanViewStaffInfo: false,
  };
}

export const signature = query => JSON.stringify(
  query.Query.map(group => group.map(condition => [condition.Name, condition.Operator, condition.Values])),
);

export function reviewResults(data, query, names) {
  if (!data?.Settings?.Query || signature(data.Settings.Query) !== signature(query)) {
    throw Error('Realm did not return the requested query. Nothing was saved.');
  }
  if (!Array.isArray(data.Items) || !Array.isArray(data.Settings.Columns) ||
      !Number.isInteger(data.TotalCount) || typeof data.HasMore !== 'boolean') {
    throw Error('Realm returned an unfamiliar results format.');
  }
  if (data.HasMore || data.Items.length !== data.TotalCount) {
    throw Error('Realm returned only part of the results. Saving is blocked until the review is complete.');
  }
  const columns = data.Settings.Columns.map(column => column.Name);
  const required = ['IndividualId', 'ContactInfo_Label', 'ContactInfo_FirstName',
    'ContactInfo_PreferredName', 'ContactInfo_LastName'];
  if (required.some(column => !columns.includes(column))) throw Error('Required name columns are missing.');
  const people = data.Items.map(row => {
    if (row.length !== columns.length) throw Error('Result columns have changed.');
    return Object.fromEntries(required.map(key => [key, row[columns.indexOf(key)]]));
  });
  const norm = x => String(x ?? '').normalize('NFC').trim().toLowerCase();
  const used = new Set();
  const rows = names.map(name => {
    const found = people.filter(person =>
      norm(person.ContactInfo_LastName) === norm(name.family) &&
      [person.ContactInfo_FirstName, person.ContactInfo_PreferredName].some(x => norm(x) === norm(name.given)),
    );
    const matches = [...new Map(found.map(person => [person.IndividualId, person])).values()];
    matches.forEach(person => used.add(person.IndividualId));
    return {
      name: `${name.given} ${name.family}`,
      status: matches.length === 1 ? 'Matched' : matches.length ? 'Ambiguous' : 'Missing',
      matches: matches.map(person => person.ContactInfo_Label),
    };
  });
  return {
    rows,
    total: data.TotalCount,
    returned: people.map(person => ({
      id: person.IndividualId,
      name: person.ContactInfo_Label,
      given: person.ContactInfo_FirstName,
      preferred: person.ContactInfo_PreferredName,
      family: person.ContactInfo_LastName,
    })),
    unexpected: people.filter(person => !used.has(person.IndividualId)).length,
    ready: rows.every(row => row.status === 'Matched') && people.every(person => used.has(person.IndividualId)),
  };
}

export function selectionQuery(review, selectedIds) {
  const people = review.returned.filter(person => selectedIds.has(person.id));
  if (!people.length) throw Error('Check at least one person.');
  const query = buildQuery(people.map(person => ({
    given: person.given || person.preferred, family: person.family,
  })));
  // Excluded is present in Realm's captured schema; UUID-array behavior needs live verification.
  const norm = x => String(x ?? '').trim().toLowerCase();
  const excluded = review.returned.filter(person =>
    !selectedIds.has(person.id) && people.some(chosen =>
      norm(chosen.family) === norm(person.family) &&
      [person.given, person.preferred].some(name => norm(name) === norm(chosen.given || chosen.preferred)),
    ),
  ).map(person => person.id);
  query.Excluded = excluded.length ? excluded : null;
  return query;
}

export function verifySelection(data, query, selectedIds) {
  const review = reviewResults(data, query, []);
  const actual = new Set(review.returned.map(person => person.id));
  if (actual.size !== selectedIds.size || [...selectedIds].some(id => !actual.has(id))) {
    throw Error('Realm did not return exactly the checked profiles. Nothing was saved. Selecting one of two same-name profiles may require a different Realm exclusion format.');
  }
  return true;
}
