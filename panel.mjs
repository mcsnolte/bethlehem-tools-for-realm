import {readTable, suggestMapping, mappedNames} from './import.mjs';
import {parseNames, buildQuery} from './core.mjs';
import {openRealmResults} from './bridge.mjs';

const $ = id => document.getElementById(id);
const tabId = Number(new URLSearchParams(location.search).get('tab'));
let busy = false;
let headerKey = '';

function status(text, error = false) {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
}

function controls() {
  $('open-results').disabled = busy || !tabId;
  $('names').disabled = busy;
  $('file').disabled = busy;
  $('include-preferred').disabled = busy;
  document.querySelectorAll('#mapping select, #has-header, #back-menu')
    .forEach(element => element.disabled = busy);
}

$('names').addEventListener('input', () => {
  refreshMapping();
  status('Ready. Click Open results in Realm when your names are ready.');
});

$('file').onchange = async () => {
  if (busy) return;
  const file = $('file').files[0];
  if (!file) return;
  $('names').value = '';
  refreshMapping(true);
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
    status('File loaded. Check the names and column mapping, then click Open results in Realm.');
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    $('file').value = '';
    controls();
  }
};

$('open-results').onclick = async () => {
  if (busy || !tabId) return;
  busy = true;
  controls();
  status('Opening results in your Realm tab…');
  try {
    const query = buildQuery(sourceNames(), {includePreferredName: $('include-preferred').checked});
    const results = await chrome.scripting.executeScript({
      target: {tabId}, func: openRealmResults, args: [query],
    });
    const result = results[0]?.result;
    if (!result) throw Error('Realm tab is unavailable. Reopen the extension from Realm.');
    if (!result.ok) throw Error(result.error);
    status('Results requested in your Realm tab. Review people, edit the query, or save it there.');
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    controls();
  }
};

if (tabId) status('Ready. Results will open in the signed-in Realm tab.');
controls();
$('build-version').textContent = ' · ' + chrome.runtime.getManifest().version_name;

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
  refreshMapping(true);
};
for (const id of ['separator', 'name-mode', 'map-given', 'map-family', 'map-full']) {
  $(id).onchange = () => {
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
