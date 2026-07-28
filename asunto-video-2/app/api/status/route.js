const DEFAULT_MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const falKey = searchParams.get("apiKey") || process.env.FAL_KEY;
  if (!falKey) {
    return Response.json({ error: "API-avain puuttuu." }, { status: 500 });
  }

  const requestId = searchParams.get("requestId");
  if (!requestId) {
    return Response.json({ error: "requestId puuttuu." }, { status: 400 });
  }

  // model kertoo mitä fal.ai-mallia vasten tätä requestId:tä tarkistetaan
  // (klipin generointi vs. klippien yhdistäminen käyttävät eri malleja).
  const model = searchParams.get("model") || DEFAULT_MODEL;

  try {
    const statusRes = await fetch(
      `https://queue.fal.run/${model}/requests/${requestId}/status`,
      { headers: { Authorization: `Key ${falKey}` } }
    );
    const statusData = await statusRes.json();

    if (statusData.status !== "COMPLETED") {
      return Response.json({ status: statusData.status });
    }

    const resultRes = await fetch(
      `https://queue.fal.run/${model}/requests/${requestId}`,
      { headers: { Authorization: `Key ${falKey}` } }
    );
    const resultData = await resultRes.json();
    const videoUrl = resultData?.video?.url || null;

    return Response.json({ status: "COMPLETED", videoUrl });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
