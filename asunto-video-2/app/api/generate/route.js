import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'fal-ai/kling-video/v3/standard/image-to-video';

const DEFAULT_PROMPT = `Create a premium, photorealistic real-estate walkthrough from this exact interior photograph.
Use an extremely smooth, stabilized professional cinema-camera movement: a slow, constant-speed dolly/push-in with gentle, controlled parallax.
The camera must feel like it is mounted on a high-end motorized gimbal or dolly, NOT handheld.
Movement should be continuous, fluid and steady from the first frame to the last, with no sudden acceleration, stops, bumps, micro-jitters, vibration, wobble or handheld shake.
Keep the horizon level and the camera height stable. Use subtle natural depth and parallax while preserving the exact composition and perspective of the original room.
Preserve the exact architecture, walls, ceilings, windows, doors, furniture, fixtures, materials, colors and room layout.
Do not invent, remove, replace or move objects. Keep geometry rigid and consistent throughout the shot.
Natural daylight, realistic exposure, premium real-estate cinematography, clean professional commercial quality, sharp details, stable image, no stylization.`;

const NEGATIVE_PROMPT = `handheld camera, shaky camera, camera shake, camera vibration, jitter, micro-jitter, wobble, unstable camera, jerky movement, sudden movement, abrupt acceleration, abrupt deceleration, camera bounce, rolling shutter, warping, morphing, flicker, frame instability, geometry distortion, bending walls, moving furniture, changing architecture, duplicated objects, disappearing objects, new objects, people, text, blur, low quality, surreal motion`;

async function createJob(image) {
  const buffer = Buffer.from(await image.arrayBuffer());
  const file = new File([buffer], image.name || 'room-image.jpg', { type: image.type || 'image/jpeg' });
  const imageUrl = await fal.storage.upload(file);

  const { request_id } = await fal.queue.submit(MODEL, {
    input: {
      prompt: DEFAULT_PROMPT,
      start_image_url: imageUrl,
      duration: '5',
      generate_audio: false,
      negative_prompt: NEGATIVE_PROMPT,
    },
  });

  return { requestId: request_id, name: image.name || 'room-image' };
}

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

    for (const image of images) {
      if (!image.type?.startsWith('image/')) {
        return NextResponse.json({ error: `${image.name || 'Tiedosto'} ei ole kuvatiedosto.` }, { status: 400 });
      }
      if (image.size > 8 * 1024 * 1024) {
        return NextResponse.json({ error: `${image.name || 'Kuva'} on liian suuri. Maksimi on 8 MB.` }, { status: 400 });
      }
    }

    const results = await Promise.allSettled(images.map(createJob));
    const jobs = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
    const failures = results.filter((result) => result.status === 'rejected');

    if (!jobs.length) {
      const firstError = failures[0]?.reason;
      console.error('All fal.ai generation jobs failed:', firstError);
      return NextResponse.json({ error: firstError?.message || 'AI-videoiden käynnistys epäonnistui.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jobs, failed: failures.length });
  } catch (error) {
    console.error('fal.ai generation error:', error);
    return NextResponse.json({ error: error?.message || 'AI-videon generointi epäonnistui.' }, { status: 500 });
  }
}
