// Lähettää yhden kuvan fal.ai:n image-to-video-jonoon.
// Tarkista mallin nimi aina https://fal.ai/models -sivulta ennen käyttöä,
// koska mallien osoitteet (slugit) ja parametrit päivittyvät.
const FAL_MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";

const MOTION_PROMPTS = {
  "push-in": "slow smooth camera push forward into the room, real estate walkthrough style, no people",
  pan: "slow smooth horizontal camera pan across the room, real estate walkthrough style, no people",
  orbit: "slow smooth camera orbit around the center of the room, real estate walkthrough style, no people",
  "room-tour": "slow smooth continuous camera glide through the room following the walls, real estate walkthrough style, no people",
};

export async function POST(request) {
  const { image, motion, apiKey } = await request.json();
  const falKey = apiKey || process.env.FAL_KEY;
  if (!falKey) {
    return Response.json(
      { error: "API-avain puuttuu. Liitä se yläpalkin kenttään tai .env.local-tiedostoon." },
      { status: 500 }
    );
  }

  if (!image) {
    return Response.json({ error: "Kuva puuttuu." }, { status: 400 });
  }

  const prompt = MOTION_PROMPTS[motion] || MOTION_PROMPTS["push-in"];

  try {
    const res = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: image, // data: URI kelpaa suoraan
        prompt,
        duration: "5",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json(
        { error: `fal.ai-kutsu epäonnistui: ${text}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    // fal palauttaa request_id:n, jolla työn tilaa voi kysellä.
    return Response.json({ requestId: data.request_id, model: FAL_MODEL });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
