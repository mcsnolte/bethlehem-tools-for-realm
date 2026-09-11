chrome.action.onClicked.addListener(async tab => {
  const valid = tab.url?.startsWith('https://onrealm.org/BethlehemWELS/');
  const path = `panel.html${valid ? '?tab=' + tab.id : ''}`;
  try {
    if (!chrome.sidePanel?.open) throw Error('Side panel unavailable');
    await chrome.sidePanel.setOptions({tabId: tab.id, path, enabled: true});
    await chrome.sidePanel.open({tabId: tab.id});
  } catch {
    // Chromium browsers without working side-panel support retain a normal window.
    await chrome.windows.create({
      url: chrome.runtime.getURL(path), type: 'normal', width: 760, height: 820,
    });
  }
});
