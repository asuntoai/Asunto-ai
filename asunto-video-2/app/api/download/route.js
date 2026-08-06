import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request) {
  try {
    const url = new URL(request.url).searchParams.get('url');
    if (!url) return NextResponse.json({ error: 'Video URL puuttuu.' }, { status: 400 });

    const parsed = new URL(url);
    // Only proxy video URLs returned by fal.ai. This prevents the endpoint
    // from becoming an arbitrary server-side URL fetcher.
    if (!parsed.hostname.endsWith('fal.media')) {
      return NextResponse.json({ error: 'Virheellinen video-osoite.' }, { status: 400 });
    }

    const response = await fetch(parsed.toString(), { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ error: 'Videon lataus epäonnistui.' }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': 'attachment; filename="asunto-ai-video.mp4"',
      'Cache-Control': 'no-store',
    });
    if (contentLength) headers.set('Content-Length', contentLength);

    return new NextResponse(response.body, { status: 200, headers });
  } catch (error) {
    console.error('Video download error:', error);
    return NextResponse.json({ error: 'Videon lataus epäonnistui.' }, { status: 500 });
  }
}
