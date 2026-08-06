import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'fal-ai/kling-video/v3/standard/image-to-video';
const DEFAULT_PROMPT = `Create a premium luxury real-estate listing video from this single interior photo.
Use a perfectly stabilized professional cinema camera on a motorized dolly.
The camera performs only a very slow, smooth, continuous forward glide through the scene, like a high-end property tour.
The motion is gentle, elegant and effortless, with a constant speed and no visible physical camera movement.
Keep the camera height, lens perspective and horizon completely stable throughout the shot.
The room should feel calm, polished and professionally filmed for a luxury real-estate listing.
Preserve the exact architecture, room geometry, furniture, windows, doors, materials, colors and proportions from the source image.
Do not add, remove or transform objects. Keep straight lines straight and maintain stable geometry.
Natural daylight, photorealistic, clean cinematic real-estate footage.`;

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
      negative_prompt: `handheld footage, handheld camera, human camera operator, walking movement, walking motion, footsteps, body movement, bobbing, bouncing, swaying, rocking, shaking, vibration, jitter, micro-jitter, wobble, unstable camera, camera shake, camera movement artifacts, sudden movement, acceleration, deceleration, speed changes, whip movement, fast movement, pan, tilt, orbit, rotation, zoom, lens breathing, rolling shutter, flicker, warping, morphing, geometry distortion, changing perspective, changing furniture, changing architecture, new objects, people, text, blur, low quality`,
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
