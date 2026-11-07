// Share the file where the browser can (iOS: Save to Files), otherwise download it.
// Resolves false when the person cancels the share sheet.
export async function saveFile(name, text, type = 'application/json', nav = navigator) {
  const file = new File([text], name, { type });
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
