const DIRECT_MODERN_SHELL_PATTERNS = [
  /^\/$/,
  /^\/login$/,
  /^\/chronicle\/login$/,
  /^\/chronicle$/,
  /^\/chronicle\/$/,
  /^\/dashboard$/,
  /^\/chronicle\/dashboard$/,
  /^\/questionnaire$/,
  /^\/participant$/,
  /^\/studies$/,
  /^\/studies\/[^/]+$/,
  /^\/studies\/[^/]+\/questionnaires$/,
  /^\/studies\/[^/]+\/participants$/,
  /^\/studies\/[^/]+\/compliance$/,
  /^\/studies\/[^/]+\/downloads$/,
  /^\/studies\/[^/]+\/audit$/,
  /^\/studies\/[^/]+\/settings-audit$/,
  /^\/studies\/[^/]+\/time-use-diary$/,
  /^\/survey$/,
  /^\/time-use-diary$/,
  /^\/chronicle\/dashboard$/,
  /^\/chronicle\/questionnaire$/,
  /^\/chronicle\/participant$/,
  /^\/chronicle\/studies$/,
  /^\/chronicle\/studies\/[^/]+$/,
  /^\/chronicle\/studies\/[^/]+\/questionnaires$/,
  /^\/chronicle\/studies\/[^/]+\/participants$/,
  /^\/chronicle\/studies\/[^/]+\/downloads$/,
  /^\/chronicle\/studies\/[^/]+\/audit$/,
  /^\/chronicle\/studies\/[^/]+\/compliance$/,
  /^\/chronicle\/studies\/[^/]+\/settings-audit$/,
  /^\/chronicle\/studies\/[^/]+\/time-use-diary$/,
  /^\/chronicle\/survey$/,
  /^\/chronicle\/time-use-diary$/,
  /^\/(?:chronicle\/)?privacy$/,
  /^\/(?:chronicle\/)?withdrawal$/,
];

export function hasEnrollmentQuery(search = '') {
  try {
    const params = new URLSearchParams(search);
    return Boolean(params.get('enroll'));
  } catch {
    return false;
  }
}

export function isModernShellRoute(pathname = '') {
  return (
    DIRECT_MODERN_SHELL_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    pathname.startsWith('/modern') ||
    pathname.startsWith('/chronicle/modern')
  );
}
