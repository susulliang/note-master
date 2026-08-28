/**
 * POST /api/transcribe — proxy a recorded audio segment to OpenAI's
 * speech-to-text API and return the transcript text.
 *
 * The client records ~15s segments of the Amazon Connect CCP call (tab
 * audio + agent mic) and posts each as multipart/form-data. Keeping the
 * OpenAI key server-side avoids exposing it in the browser bundle.
 *
 * Required environment variable (Vercel → Project → Settings → Environment
 * Variables): OPENAI_API_KEY
 *
 * Optional overrides:
 *   TRANSCRIBE_MODEL — defaults to 'gpt-4o-mini-transcribe' (~$0.003/min);
 *                      use 'whisper-1' for the classic model (~$0.006/min)
 */

/** Max serverless execution (Vercel Hobby allows up to 60s) */
export const maxDuration = 30;

const DEFAULT_MODEL = 'gpt-4o-mini-transcribe';

/** Domain vocabulary that improves proper-noun recognition */
const DOMAIN_PROMPT =
  'Ecovacs customer support call. Products: Deebot, GOAT, Winbot, UltraMarine.';

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed — POST an audio file.' }, { status: 405 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      {
        error:
          'Transcription is not configured. Add OPENAI_API_KEY to the Vercel project environment variables, then redeploy.',
      },
      { status: 501 }
    );
  }

  // Parse the multipart body
  let audio: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('audio');
    if (value instanceof File && value.size > 0) {
      audio = value;
    }
  } catch {
    audio = null;
  }
  if (!audio) {
    return Response.json({ error: 'Missing "audio" file in the request body.' }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append('file', audio, 'segment.webm');
  upstream.append('model', process.env.TRANSCRIBE_MODEL || DEFAULT_MODEL);
  upstream.append('language', 'en');
  upstream.append('prompt', DOMAIN_PROMPT);
  upstream.append('response_format', 'json');

  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!res.ok) {
      const detail = await res.text();
      return Response.json(
        { error: `Transcription service error (${res.status}): ${detail.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { text?: string };
    return Response.json({ text: data.text ?? '' });
  } catch (err) {
    return Response.json(
      { error: `Transcription request failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
