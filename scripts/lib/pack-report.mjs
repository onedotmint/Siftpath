/** npm 11 returns an array of reports; npm 12 returns an object keyed by package name. */
export function packReports(json) {
  const value = JSON.parse(json ?? '');
  const entries = Array.isArray(value) ? value : Object.values(value ?? {});
  const valid = entries.filter(entry => entry && typeof entry === 'object'
    && typeof entry.filename === 'string' && Array.isArray(entry.files)
    && entry.files.every(file => file && typeof file.path === 'string'));
  // An unrecognised shape is a hard error, never an empty-but-passing file list.
  if (valid.length !== 1 || valid.length !== entries.length) throw new Error(`Unsupported npm pack --json report (npm ${process.env.npm_config_user_agent ?? '?'}).`);
  return valid[0];
}
