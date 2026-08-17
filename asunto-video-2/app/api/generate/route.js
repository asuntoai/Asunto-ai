import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'fal-ai/bytedance/seedance-2.0/image-to-video';
const PROMPT = `Static real estate interior shot. The camera moves smoothly sideways from left to right on a perfectly straight motorized track. Extremely slow, constant-speed lateral movement only. No zoom, no push-in, no forward or backward movement, no rotation, no pan or tilt. Perfectly stabilized, level and steady camera. The room, architecture, furniture, windows and lighting remain completely static. Only the camera position changes. Premium real estate cinematography, clean and calm.`;

async function createJob(image) {
  const buffer = Buffer.from(await image.arrayBuffer());
  const file = new File([buffer], image.name || 'room-image.jpg', { type: image.type || 'image/jpeg' });
  const imageUrl = await fal.storage.upload(file);

  const result = await fal.subscribe(MODEL, {
    input: {
      image_url: imageUrl,
      prompt: PROMPT,
      duration: 5,
    },
    logs: false,
  });

  const videoUrl = result?.data?.video?.url || result?.video?.url || null;
  if (!videoUrl) throw new Error('Seedance ei palauttanut videota.');

  return { requestId: `seedance-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: image.name || 'room-image', videoUrl };
}

export async function POST(request) {
  try {
    if (!process.env.FAL_KEY) return NextResponse.json({ error: 'FAL_KEY puuttuu Vercelin ympäristömuuttujista.' }, { status: 500 });
    fal.config({ credentials: process.env.FAL_KEY });

    const formData = await request.formData();
    const images = formData.getAll('images').filter((file) => file && typeof file.arrayBuffer === 'function');
    if (!images.length) return NextResponse.json({ error: 'Lisää vähintään yksi kuva.' }, { status: 400 });
    if (images.length > 20) return NextResponse.json({ error: 'Enintään 20 kuvaa kerralla.' }, { status: 400 });

    for (const image of images) {
      if (!image.type?.startsWith('image/')) return NextResponse.json({ error: `${image.name || 'Tiedosto'} ei ole kuvatiedosto.` }, { status: 400 });
      if (image.size > 8 * 1024 * 1024) return NextResponse.json({ error: `${image.name || 'Kuva'} on liian suuri. Maksimi on 8 MB.` }, { status: 400 });
    }

    const results = await Promise.allSettled(images.map(createJob));
    const jobs = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const failures = results.filter((r) => r.status === 'rejected');

    if (!jobs.length) return NextResponse.json({ error: failures[0]?.reason?.message || 'Seedance-videon generointi epäonnistui.' }, { status: 500 });
    return NextResponse.json({ ok: true, jobs, failed: failures.length });
  } catch (error) {
    console.error('Seedance generation error:', error);
    return NextResponse.json({ error: error?.message || 'Videon generointi epäonnistui.' }, { status: 500 });
  }
}
