import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'fal-ai/kling-video/v3/standard/image-to-video';

const DEFAULT_PROMPT = `Premium real estate interior video. The camera is locked to a perfectly stabilized professional motorized slider. Move the camera very slowly and smoothly from left to right across the room. The movement is purely lateral and constant-speed. No forward movement, no zoom, no push-in, no pull-out. Keep the camera level, with constant height and stable perspective. The room, architecture, furniture, walls, windows, lighting and all objects remain completely static and unchanged. Only the camera translates gently sideways. Calm, elegant, polished real estate cinematography.`;

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
      negative_prompt: `zoom, zoom in, zoom out, dolly in, dolly out, forward movement, backward movement, walking, footsteps, handheld, human camera operator, body movement, camera shake, camera jitter, vibration, bobbing, bouncing, swaying, wobble, rocking, unstable camera, shaky camera, micro jitter, sudden movement, fast movement, acceleration, deceleration, speed changes, large camera movement, aggressive camera movement, pan, tilt, orbit, rotation, whip pan, dramatic pan, distortion, warping, morphing, flicker, changing furniture, changing architecture, moving walls, new objects, people, text, blur, low quality`,
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
