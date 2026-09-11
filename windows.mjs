export function openRealmWindow(event, link) {
  event.preventDefault();
  const url = new URL(link.href);
  if (url.origin !== 'https://onrealm.org' || !url.pathname.startsWith('/BethlehemWELS/')) {
    return Promise.reject(Error('This link is not a Bethlehem Realm page.'));
  }
  return chrome.windows.create({
    url: url.href, type: 'normal', width: 1000, height: 850, focused: true,
  });
}
