import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'fal-ai/kling-video/v3/standard/image-to-video';
const DEFAULT_PROMPT = 'Create a realistic luxury real-estate walkthrough from this interior photo. Slowly and smoothly move the camera forward through the room with a subtle cinematic push-in. Preserve the exact architecture, furniture, colors, materials, windows, doors and layout. No new objects, no people, no text, no warping, no flicker. Natural daylight, stable geometry, professional real-estate video.';

export async function POST(request) {
  try {
    if (!process.env.FAL_KEY) {
      return NextResponse.json({ error: 'FAL_KEY puuttuu Vercelin ympäristömuuttujista.' }, { status: 500 });
    }

    fal.config({ credentials: process.env.FAL_KEY });
    const formData = await request.formData();
    const images = formData.getAll('images').filter((file) => file && typeof file.arrayBuffer === 'function');

    if (!images.length) return NextResponse.json({ error: 'Lisää vähintään yksi kuva.' }, { status: 400 });
    if (images.length > 20) return NextResponse.json({ error: 'Enintään 20 kuvaa kerralla.' }, { status: 400 });

    const jobs = [];

    for (const image of images) {
      if (!image.type?.startsWith('image/')) continue;
      if (image.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: `${image.name || 'Kuva'} on liian suuri. Maksimi on 8 MB.` }, { status: 400 });
      }

      const buffer = Buffer.from(await image.arrayBuffer());
      const file = new File([buffer], image.name || 'room-image.jpg', { type: image.type || 'image/jpeg' });
      const imageUrl = await fal.storage.upload(file);

      const { request_id } = await fal.queue.submit(MODEL, {
        input: {
          prompt: DEFAULT_PROMPT,
          start_image_url: imageUrl,
          duration: '5',
          generate_audio: false,
          negative_prompt: 'warping, flicker, camera shake, distorted furniture, changing architecture, new objects, people, text, blur, low quality',
        },
      });

      jobs.push({ requestId: request_id, name: image.name || 'room-image' });
    }

    if (!jobs.length) return NextResponse.json({ error: 'Yhtään kelvollista kuvatiedostoa ei löytynyt.' }, { status: 400 });
    return NextResponse.json({ ok: true, jobs });
  } catch (error) {
    console.error('fal.ai generation error:', error);
    return NextResponse.json({ error: error?.message || 'AI-videon generointi epäonnistui.' }, { status: 500 });
  }
}
