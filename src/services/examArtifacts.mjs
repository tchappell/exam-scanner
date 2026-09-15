export function examResultFilename(result) {
  return `${result.student_number} ${result.surname} ${result.initials}`
    .trim()
    .replaceAll("'", '')
    .replaceAll(' ', '_');
}

export async function hashBlob(blob) {
  const data = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}
