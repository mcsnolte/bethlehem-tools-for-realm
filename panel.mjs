import {readTable, suggestMapping, mappedNames} from './import.mjs';
import {openRealmWindow} from './windows.mjs';
import {parseNames, buildQuery, reviewResults, selectionQuery, verifySelection} from './core.mjs';
import {realmRequest} from './bridge.mjs';

const $ = id => document.getElementById(id);
const tabId = Number(new URLSearchParams(location.search).get('tab'));
let reviewed = null;
let selected = new Set();
let busy = false;
let uncertain = false;
let headerKey = '';

function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

function controls() {
  $('preview').disabled = busy || !tabId || uncertain;
  $('save').disabled = busy || !reviewed || !selected.size || !$('report').value.trim() || uncertain;
  $('names').disabled = busy;
  $('file').disabled = busy;
  $('report').disabled = busy;
  document.querySelectorAll('#rows input, #mapping select, #has-header, #back-menu')
    .forEach(element => element.disabled = busy);
}

function invalidate() {
  reviewed = null;
  selected.clear();
  $('review').hidden = true;
  $('result').hidden = true;
  controls();
}

async function call(operation, payload) {
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: {tabId}, func: realmRequest, args: [operation, payload],
    });
  } catch (error) {
    // A lost response cannot establish whether the injected save reached Realm.
    if (operation === 'save') uncertain = true;
    throw error;
  }
  const result = results[0]?.result;
  if (!result) {
    if (operation === 'save') uncertain = true;
    throw Error('Realm tab is unavailable. Reopen the extension from Realm.');
  }
  if (!result.ok) {
    if (result.uncertain) uncertain = true;
    throw Error(result.error);
  }
  return result;
}

$('names').addEventListener('input', () => {
  invalidate();
  refreshMapping();
});
$('report').addEventListener('input', controls);

$('file').onchange = async () => {
  if (busy) return;
  const file = $('file').files[0];
  if (!file) return;
  invalidate();
  if (file.size > 100000) {
    status('Choose a file under 100 KB.', true);
    return;
  }
  busy = true;
  controls();
  status('Reading file…');
  try {
    $('names').value = await file.text();
    $('separator').value = 'auto';
    const headers = readTable($('names').value)[0] || [];
    const guess = suggestMapping(headers);
    $('has-header').checked = file.name.toLowerCase().endsWith('.csv') ||
      Object.values(guess).some(i => i >= 0);
    refreshMapping(true);
    status('File loaded. Check the names and column mapping, then click Find people.');
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    $('file').value = '';
    controls();
  }
};

$('preview').onclick = async () => {
  if (busy || uncertain || !tabId) return;
  invalidate();
  busy = true;
  controls();
  status('Checking names in Realm…');
  try {
    const names = sourceNames();
    const candidate = buildQuery(names);
    const response = await call('preview', candidate);
    const review = reviewResults(response.data, candidate, names);
    reviewed = review;
    selected = new Set();
    const ambiguousNames = new Set(review.rows.filter(row => row.status === 'Ambiguous')
      .flatMap(row => row.matches));
    $('rows').replaceChildren();
    for (const person of review.returned) {
      const row = document.createElement('tr');
      const checkCell = document.createElement('td');
      const personCell = document.createElement('td');
      const detailCell = document.createElement('td');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.setAttribute('aria-label', 'Include ' + person.name);
      check.checked = !ambiguousNames.has(person.name) && review.unexpected === 0;
      if (check.checked) selected.add(person.id);
      check.onchange = () => {
        if (check.checked) selected.add(person.id);
        else selected.delete(person.id);
        updateCount();
        controls();
      };
      checkCell.append(check);
      const link = document.createElement('a');
      link.textContent = person.name;
      link.href = 'https://onrealm.org/BethlehemWELS/Individual/Info/' + encodeURIComponent(person.id);
      link.target = '_blank';
      link.rel = 'noopener';
      link.title = 'Open profile in a separate window';
      link.onclick = event => openRealmWindow(event, link).catch(error => status(error.message, true));
      personCell.append(link);
      detailCell.textContent = (ambiguousNames.has(person.name) ? 'Same name — review profile. ' : '') +
        `First: ${person.given || '—'}; preferred: ${person.preferred || '—'}; surname: ${person.family || '—'}`;
      row.append(checkCell, personCell, detailCell);
      $('rows').append(row);
    }
    for (const missing of review.rows.filter(row => row.status === 'Missing')) {
      const row = document.createElement('tr');
      for (const text of ['—', missing.name, 'No matching profile found']) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      $('rows').append(row);
    }
    $('review').hidden = false;
    updateCount();
    status(`${review.total} profiles found. Unique matches are checked; review same-name profiles and uncheck anyone you do not want.`);
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    controls();
  }
};

$('save').onclick = async () => {
  if (!reviewed || !selected.size || busy || uncertain) return;
  busy = true;
  controls();
  status('Verifying checked profiles…');
  try {
    const chosen = selectionQuery(reviewed, selected);
    const confirmation = await call('preview', chosen);
    verifySelection(confirmation.data, chosen, selected);
    status('Saving checked profiles…');
    const result = await call('save', {
      Name: $('report').value.trim(),
      Description: 'Created from a reviewed name list using Bethlehem Realm Name Query.',
      Query: chosen,
      Tags: [],
    });
    reviewed = null;
    selected.clear();
    $('result').href = `https://onrealm.org/BethlehemWELS/Queries/Results/${result.id}`;
    $('result').hidden = false;
    status('Realm returned a new report ID. Open the report to verify the saved results.');
  } catch (error) {
    status(error.message + (uncertain ? ' Check My Saved Reports before starting another save.' : ''), true);
  } finally {
    busy = false;
    controls();
  }
};

if (tabId) status('Ready. Keep the signed-in Realm tab open while you work.');
controls();
$('build-version').textContent = ' · ' + chrome.runtime.getManifest().version_name;

function updateCount() {
  $('selection-count').textContent = selected.size + ' profiles selected';
}

$('result').onclick = event => openRealmWindow(event, $('result'))
  .catch(error => status(error.message, true));

function mappingOptions() {
  return {
    mode: $('name-mode').value,
    given: Number($('map-given').value),
    family: Number($('map-family').value),
    full: Number($('map-full').value),
    delimiter: $('separator').value === 'tab' ? '\t' : $('separator').value,
  };
}

function sourceNames() {
  return $('has-header').checked
    ? mappedNames($('names').value, mappingOptions()).names
    : parseNames($('names').value);
}

function refreshMapping(reset = false) {
  $('mapping').hidden = !$('has-header').checked;
  if (!$('has-header').checked) return;
  try {
    const headers = readTable($('names').value, mappingOptions().delimiter)[0] || [];
    const key = JSON.stringify(headers);
    if (reset || key !== headerKey) {
      headerKey = key;
      const guess = suggestMapping(headers);
      for (const field of ['given', 'family', 'full']) {
        const select = $('map-' + field);
        select.replaceChildren(new Option('Choose a column…', '-1'));
        headers.forEach((header, i) => select.add(new Option(
          `${header.trim() || '(blank header)'} · column ${i + 1}`, String(i),
        )));
        select.value = String(guess[field]);
      }
      $('name-mode').value = guess.given >= 0 && guess.family >= 0 ? 'split' : guess.full >= 0 ? 'full' : 'split';
    }
    $('split-fields').hidden = $('name-mode').value === 'full';
    $('full-fields').hidden = $('name-mode').value !== 'full';
    const imported = mappedNames($('names').value, mappingOptions());
    $('mapping-preview').textContent =
      `${imported.names.length} names${imported.duplicates ? '; ' + imported.duplicates + ' repeated rows combined' : ''}. Example: ` +
      imported.names.slice(0, 2).map(name => name.given + ' ' + name.family).join(' / ');
  } catch (error) {
    $('mapping-preview').textContent = error.message;
  }
}

$('has-header').onchange = () => {
  invalidate();
  refreshMapping(true);
};
for (const id of ['separator', 'name-mode', 'map-given', 'map-family', 'map-full']) {
  $(id).onchange = () => {
    invalidate();
    refreshMapping(id === 'separator');
  };
}
$('open-names').onclick = () => {
  $('tool-menu').hidden = true;
  $('name-tool').hidden = false;
};
$('back-menu').onclick = () => {
  $('name-tool').hidden = true;
  $('tool-menu').hidden = false;
};
document.querySelector('.file').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && !busy) {
    event.preventDefault();
    $('file').click();
  }
});
