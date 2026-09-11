// Runs in the Realm tab's isolated extension world. Credentials never leave this function.
export async function realmRequest(operation, payload) {
  try {
    if (location.origin !== 'https://onrealm.org' || !location.pathname.startsWith('/BethlehemWELS/')) {
      throw Error('Open Bethlehem Realm and launch the extension there.');
    }
    const base = '/BethlehemWELS/Queries/';
    let token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
    if (!token) {
      const response = await fetch(base + 'Saved', {
        credentials: 'same-origin', signal: AbortSignal.timeout(30000),
      });
      if (!response.ok || new URL(response.url).origin !== location.origin) {
        throw Error('Sign in to Realm, then reopen the extension.');
      }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      token = doc.querySelector('input[name="__RequestVerificationToken"]')?.value;
    }
    if (!token) {
      throw Error('Realm’s session token was not found. Open My Saved Reports, then try again.');
    }

    async function post(endpoint, form) {
      const response = await fetch(base + endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({...form, __RequestVerificationToken: token}),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw Error(`${endpoint} returned HTTP ${response.status}.`);
      if (!response.headers.get('content-type')?.includes('json')) {
        throw Error('Realm did not return JSON. Your session may have expired.');
      }
      return response.json();
    }

    if (operation === 'preview') {
      const errors = await post('ValidateQuery', {args: JSON.stringify(payload)});
      if (!Array.isArray(errors) || errors.length) {
        throw Error('Realm reported query validation errors. No report was saved.');
      }
      // Match Realm's captured unsaved-query form submission before requesting the grid.
      const initialized = await fetch(base + 'Results', {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
        body: new URLSearchParams({
          'query-id': '',
          'query-type': '',
          'query-args': JSON.stringify(payload),
          'query-name': '',
          'query-description': '',
          'query-initial-data': '',
          'query-selected-tags': '[]',
          __RequestVerificationToken: token,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (!initialized.ok || !initialized.headers.get('content-type')?.includes('text/html')) {
        throw Error('Realm could not initialize the unsaved query. Nothing was saved.');
      }
      const resultPage = new DOMParser().parseFromString(await initialized.text(), 'text/html');
      const refreshedToken = resultPage.querySelector('input[name="__RequestVerificationToken"]')?.value;
      if (refreshedToken) token = refreshedToken;
      const data = await post('GetResultsGrid', {
        page: '0', args: JSON.stringify({...payload, Search: 0}), id: '', queryType: '',
      });

      // The captured grid starts at page 0. Try successive pages, failing closed
      // if Realm repeats a page, changes the query, or gives inconsistent totals.
      const shape = page => JSON.stringify(page.Settings?.Columns);
      const queryShape = page => JSON.stringify(page.Settings?.Query?.Query);
      if (!Array.isArray(data.Items) || !Number.isInteger(data.TotalCount) || typeof data.HasMore !== 'boolean') {
        throw Error('Realm returned an unfamiliar page format.');
      }
      const idColumn = data.Settings?.Columns?.findIndex(column => column.Name === 'IndividualId');
      if (!Number.isInteger(idColumn) || idColumn < 0) throw Error('Realm omitted individual IDs.');
      const seen = new Set(data.Items.map(row => row[idColumn]));
      if (seen.has(undefined) || seen.has(null) || seen.size !== data.Items.length) {
        throw Error('Realm returned duplicate or missing individual IDs.');
      }
      let pageNumber = 0;
      while (data.HasMore || data.Items.length < data.TotalCount) {
        if (++pageNumber > 100) throw Error('Stopped after 100 pages. Nothing was saved.');
        const next = await post('GetResultsGrid', {
          page: String(pageNumber), args: JSON.stringify({...payload, Search: 0}), id: '', queryType: '',
        });
        if (!Array.isArray(next.Items) || !Number.isInteger(next.TotalCount) ||
            next.TotalCount < data.TotalCount || typeof next.HasMore !== 'boolean' ||
            shape(next) !== shape(data) || queryShape(next) !== queryShape(data)) {
          throw Error('Realm changed its results during paging. Please run Find people again.');
        }
        if (!next.Items.length || next.Items.some(row => !row[idColumn] || seen.has(row[idColumn]))) {
          throw Error('Realm repeated a page or stopped before all results arrived. Nothing was saved.');
        }
        for (const row of next.Items) {
          if (seen.has(row[idColumn])) throw Error('Realm returned duplicate people within a page.');
          seen.add(row[idColumn]);
        }
        data.Items.push(...next.Items);
        data.HasMore = next.HasMore;
        data.TotalCount = next.TotalCount;
        if (data.Items.length > data.TotalCount) {
          throw Error('Realm returned more people than its total count. Nothing was saved.');
        }
      }

      // Only pass name fields to the extension UI; discard contact and other profile data.
      const keep = ['IndividualId', 'ContactInfo_Label', 'ContactInfo_FirstName',
        'ContactInfo_PreferredName', 'ContactInfo_LastName'];
      if (data?.Settings?.Columns && Array.isArray(data.Items)) {
        const indices = data.Settings.Columns.map((column, i) => keep.includes(column.Name) ? i : -1)
          .filter(i => i >= 0);
        if (data.Items.some(row => !Array.isArray(row) || row.length !== data.Settings.Columns.length)) {
          throw Error('Realm result columns changed.');
        }
        data.Items = data.Items.map(row => indices.map(i => row[i]));
        data.Settings.Columns = indices.map(i => data.Settings.Columns[i]);
      }
      return {
        ok: true,
        data: {Items: data.Items, TotalCount: data.TotalCount, HasMore: data.HasMore, Settings: data.Settings},
      };
    }

    if (operation === 'save') {
      const used = await post('QueryNameInUse', {name: payload.Name});
      if (used === true) throw Error('That report name already exists. Choose another name.');
      if (used !== false) throw Error('Unexpected name-check response. Nothing was saved.');
      const errors = await post('ValidateQuery', {args: JSON.stringify(payload.Query)});
      if (!Array.isArray(errors) || errors.length) {
        throw Error('Realm reported validation errors. Nothing was saved.');
      }
      try {
        const id = await post('AddSavedQuery', {args: JSON.stringify(payload)});
        if (typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) {
          throw Error('Unrecognized save response.');
        }
        return {ok: true, id};
      } catch {
        return {
          ok: false,
          uncertain: true,
          error: 'The save outcome is uncertain. Check My Saved Reports before trying again; the report may already exist.',
        };
      }
    }
    throw Error('Unknown operation.');
  } catch (error) {
    return {ok: false, error: error.message};
  }
}
