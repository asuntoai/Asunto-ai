import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'fal-ai/kling-video/v3/standard/image-to-video';

const DEFAULT_PROMPT = `Create a premium luxury real-estate listing video from this single interior photograph.
Treat the source image as a locked architectural reference and keep the composition exceptionally stable.
Create a subtle, slow cinematic room reveal using only a very gentle stabilized camera drift, as if filmed on a professional motorized slider in a luxury property commercial.
The camera movement must be extremely smooth, continuous and controlled, with no footsteps, no handheld feel and no visible shake.
Very small movement only: gently reveal the depth and spatial relationship of the room while keeping the original framing and perspective stable.
Keep the camera height and horizon level. Preserve the exact architecture, room geometry, furniture, windows, doors, materials, colors and proportions.
Do not add, remove, replace, bend or morph objects. Keep vertical and horizontal lines straight and stable.
Natural realistic daylight, photorealistic, premium real-estate cinematography, clean polished commercial footage.`;

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
      negative_prompt: `walking, walking camera, walking motion, footsteps, human movement, body movement, handheld, handheld footage, handheld camera, camera operator, shoulder camera, bobbing, bouncing, swaying, rocking, shaking, vibration, jitter, micro-jitter, wobble, camera shake, unstable camera, unstable footage, sudden movement, fast movement, rapid movement, acceleration, deceleration, speed changes, pan, tilt, orbit, rotation, zoom, whip movement, rolling shutter, lens breathing, flicker, warping, morphing, geometry distortion, perspective distortion, changing room layout, changing furniture, changing architecture, new objects, people, text, blur, low quality`,
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
