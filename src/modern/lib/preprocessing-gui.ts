export const PREPROCESSING_GUI_PATH = '/chronicle/preprocessing-gui/';

export function preprocessingGuiUrl(studyId: string, studyTitle?: string) {
  const params = new URLSearchParams({ studyId });
  if (studyTitle) {
    params.set('studyTitle', studyTitle);
  }
  return `${PREPROCESSING_GUI_PATH}?${params.toString()}`;
}

/**
 * The preprocessing GUI is a separate app (chronicle-android-raw-data-preprocessing-app)
 * bind-mounted into its own container and routed at PREPROCESSING_GUI_PATH by the proxy
 * (Traefik in production). That container — and the route — do not exist in every
 * deployment (notably the self-host bundle), and the proxy has no dedicated 404 for the
 * path: an unmatched route falls through to this dashboard's own SPA catch-all, which
 * happily returns HTTP 200 with the dashboard's own `index.html` shell.
 *
 * So "the request succeeded" does not mean "the GUI is there" — it can mean the dashboard
 * served itself back. Detect that by checking whether the response is, byte-for-byte in
 * spirit, our own shell: same mount id and same title. A genuinely different app served
 * at that path would not carry both markers.
 */
export async function isPreprocessingGuiAvailable(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(PREPROCESSING_GUI_PATH, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      method: 'GET',
    });
    if (!response.ok) {
      return false;
    }
    const body = await response.text();
    const looksLikeOwnDashboardShell = body.includes('id="app"') && body.includes('<title>Chronicle</title>');
    return !looksLikeOwnDashboardShell;
  } catch {
    return false;
  }
}
