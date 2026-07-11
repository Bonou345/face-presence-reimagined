type ZoomToken = { access_token: string; expires_in: number };

export async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom n'est pas configuré. Ajoute ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET dans les secrets du projet.",
    );
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    let zoomError = txt;
    try {
      const parsed = JSON.parse(txt) as { error?: string; reason?: string };
      zoomError = parsed.reason || parsed.error || txt;
    } catch {
      // Keep Zoom's raw text when it is not JSON.
    }

    if (res.status === 400 && txt.includes("invalid_client")) {
      throw new Error(
        "Zoom refuse les identifiants configurés. Vérifie que ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID et ZOOM_CLIENT_SECRET proviennent du même app Zoom Server-to-Server OAuth, puis remplace les secrets.",
      );
    }

    throw new Error(`Zoom OAuth a échoué (${res.status}): ${zoomError}`);
  }

  const json = (await res.json()) as ZoomToken;
  return json.access_token;
}