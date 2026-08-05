import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const images = formData.getAll('images');

    if (!images.length) {
      return NextResponse.json({ error: 'Lisää vähintään yksi kuva.' }, { status: 400 });
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json({
        error: 'FAL_KEY puuttuu palvelimen ympäristömuuttujista. Lisää se .env.local-tiedostoon tai Vercelin Environment Variables -asetuksiin.'
      }, { status: 500 });
    }

    // Upload/generation integration is intentionally isolated here.
    // This keeps the UI independent from the currently selected fal.ai model.
    return NextResponse.json({
      ok: true,
      message: `${images.length} kuva${images.length === 1 ? '' : 'a'} vastaanotettu. AI-generointi voidaan nyt yhdistää valittuun fal.ai image-to-video -malliin.`
    });
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json({ error: 'Kuvien käsittely epäonnistui.' }, { status: 500 });
  }
}
