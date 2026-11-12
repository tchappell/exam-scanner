export function examResultFilename(result) {
  return `${result.student_number} ${result.surname} ${result.initials}`
    .trim()
    .replaceAll("'", '')
    .replaceAll(' ', '_');
}

export async function hashBlob(blob) {
  return hashBytes(await blob.arrayBuffer());
}

export async function hashBytes(data) {
  const digest = await crypto.subtle.digest('SHA-1', data);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}
