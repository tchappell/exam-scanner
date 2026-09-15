export function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function createZip(filename) {
  const { default: JSZip } = await import('jszip');
  return { jszip: new JSZip(), count: 0, filename };
}

export function addBlobToZip(zip, filename, blob) {
  zip.jszip.file(filename, blob);
  zip.count++;
}

export async function downloadZip(zip) {
  if (zip.count === 0) return;
  downloadFile(zip.filename, await zip.jszip.generateAsync({ type: 'blob' }));
}
