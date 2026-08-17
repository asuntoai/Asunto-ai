import { NextResponse } from 'next/server';
import { fal } from '@fal-ai/client';

export const runtime = 'nodejs';

const MODEL = 'bytedance/seedance-2.0/image-to-video';

export async function GET(request) {
  try {
    if (!process.env.FAL_KEY) return NextResponse.json({ error: 'FAL_KEY puuttuu Vercelin ympäristömuuttujista.' }, { status: 500 });
    fal.config({ credentials: process.env.FAL_KEY });

    const requestId = new URL(request.url).searchParams.get('requestId');
    if (!requestId) return NextResponse.json({ error: 'requestId puuttuu.' }, { status: 400 });

    const status = await fal.queue.status(MODEL, { requestId, logs: false });
    if (status.status !== 'COMPLETED') {
      return NextResponse.json({ status: status.status });
    }

    const result = await fal.queue.result(MODEL, { requestId });
    return NextResponse.json({ status: 'COMPLETED', videoUrl: result.data?.video?.url || null });
  } catch (error) {
    console.error('Seedance status error:', error);
    return NextResponse.json({ status: 'ERROR', error: error?.message || 'Videon tilan tarkistus epäonnistui.' }, { status: 500 });
  }
}
