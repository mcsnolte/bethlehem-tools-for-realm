// Serialized into the Realm tab's isolated extension world; keep this self-contained.
export async function openRealmResults(query) {
  try {
    const origin = 'https://onrealm.org';
    const base = origin + '/BethlehemWELS/Queries/';
    if (location.origin !== origin || !location.pathname.startsWith('/BethlehemWELS/')) {
      throw Error('Open Bethlehem Realm and launch the extension there.');
    }
    let token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
    if (!token) {
      const response = await fetch(base + 'Saved', {
        credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        throw Error('Sign in to Realm, then reopen the extension.');
      }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      token = doc.querySelector('input[name="__RequestVerificationToken"]')?.value;
    }
    if (!token) {
      throw Error('Realm’s session token was not found. Open My Saved Reports, then try again.');
    }

    const response = await fetch(base + 'ValidateQuery', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: new URLSearchParams({args: JSON.stringify(query), __RequestVerificationToken: token}),
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error(`ValidateQuery returned HTTP ${response.status}.`);
    if (!response.headers.get('content-type')?.includes('json')) {
      throw Error('Realm did not return JSON. Your session may have expired.');
    }
    const errors = await response.json();
    if (!Array.isArray(errors) || errors.length) {
      throw Error('Realm reported query validation errors. Check your names and try again.');
    }

    // Use the same unsaved-query fields as Realm's native results form. A real
    // navigation lets Realm load its own scripts, grid, editing, and save actions.
    // An absolute action and explicit target avoid the page's <base> settings.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = base + 'Results';
    form.target = '_self';
    form.enctype = 'application/x-www-form-urlencoded';
    form.acceptCharset = 'UTF-8';
    form.hidden = true;
    const fields = {
      'query-id': '',
      'query-type': '',
      'query-args': JSON.stringify(query),
      'query-name': '',
      'query-description': '',
      'query-initial-data': '',
      'query-selected-tags': '[]',
      __RequestVerificationToken: token,
    };
    for (const [name, value] of Object.entries(fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.append(input);
    }
    document.body.append(form);
    try {
      form.submit();
    } catch (error) {
      form.remove();
      throw error;
    }
    // Keep the form connected until navigation disposes of the old document.
    // This acknowledges submission, not the eventual server response.
    return {ok: true};
  } catch (error) {
    return {ok: false, error: error.message};
  }
}
