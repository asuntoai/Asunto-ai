// Yhdistää useamman valmiin video-URL:n yhdeksi videoksi fal.ai:n
// ffmpeg-api/merge-videos-mallilla. Tarkista parametrit tarvittaessa
// osoitteesta https://fal.ai/models/fal-ai/ffmpeg-api/merge-videos/api,
// koska mallin tarkka input-muoto voi päivittyä.
export const MERGE_MODEL = "fal-ai/ffmpeg-api/merge-videos";

export async function POST(request) {
  const { videoUrls, apiKey } = await request.json();
  const falKey = apiKey || process.env.FAL_KEY;

  if (!falKey) {
    return Response.json(
      { error: "API-avain puuttuu. Liitä se yläpalkin kenttään tai .env.local-tiedostoon." },
      { status: 500 }
    );
  }

  if (!Array.isArray(videoUrls) || videoUrls.length < 2) {
    return Response.json(
      { error: "Tarvitaan vähintään kaksi valmista klippiä yhdistämistä varten." },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://queue.fal.run/${MERGE_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_urls: videoUrls, // järjestys säilyy = huoneiden esiintymisjärjestys
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `fal.ai-yhdistämiskutsu epäonnistui: ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return Response.json({ requestId: data.request_id, model: MERGE_MODEL });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
