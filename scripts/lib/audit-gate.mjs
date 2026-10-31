/** Production High/Critical blocks release; an unusable report is never a pass. */
export function auditGate(report) {
  if (typeof report?.metadata?.vulnerabilities !== 'object' || report.metadata.vulnerabilities === null) {
    throw new Error('npm audit returned an invalid report; treating it as a failure, not a pass.');
  }
  const counts = report.metadata.vulnerabilities;
  return { counts, blocked: (counts.high ?? 0) + (counts.critical ?? 0) > 0 };
}

export function auditFindings(report) {
  return Object.entries(report.vulnerabilities ?? {}).map(([name, entry]) => ({
    name, severity: entry.severity, range: entry.range,
    advisories: (entry.via ?? []).filter(via => typeof via === 'object').map(via => via.url),
  }));
}
