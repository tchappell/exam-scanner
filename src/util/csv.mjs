import Papa from 'papaparse';

function process(data) {
  // The array returned by this CSV library seems to like including an extra line with nothing but "" on it
  // Detect this line and remove it if it exists
  if (data[data.length - 1].length === 1 && data[data.length - 1][0] === "") return data.slice(0, data.length - 1);
  else return data;
}

export function loadCSV(input) {
  return new Promise((resolve, reject) => {
      Papa.parse(input, {
        complete: result => resolve(process(result.data)),
        delimiter: ',',
        error: e => reject(e)
      })
  });
}

export function createCSV(data) {
  return Papa.unparse(data, {newline: '\n'});
}
