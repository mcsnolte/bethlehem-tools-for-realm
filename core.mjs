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

export function buildQuery(people, {includePreferredName = true} = {}) {
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
  const fields = includePreferredName ? ['FirstName', 'PreferredName'] : ['FirstName'];
  for (const person of people) {
    for (const field of fields) {
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
    // Realm requires display columns to reference attributes present in the query.
    DisplayColumns: ['LastName0', ...fields.map(field => field + '0')],
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
