import type { InferenceRequest, InferenceResult, ApiKeys, Provider } from '../types';

export async function generateWithCloud(
  request: InferenceRequest,
  provider: Exclude<Provider, 'auto'>,
  apiKeys: ApiKeys,
): Promise<InferenceResult> {
  switch (provider) {
    case 'anthropic':
      return generateWithAnthropic(request, apiKeys.anthropic);
    case 'openai':
      return generateWithOpenAI(request, apiKeys.openai);
    case 'gemini':
      return generateWithGemini(request, apiKeys.gemini);
    case 'custom':
      return generateWithCustomEndpoint(request, apiKeys.customEndpoint, apiKeys.customKey);
  }
}

async function generateWithAnthropic(
  request: InferenceRequest,
  apiKey: string,
): Promise<InferenceResult> {
  if (!apiKey) throw new Error('Anthropic API key not configured');

  const SUPPORTED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
  type SupportedMime = (typeof SUPPORTED_MIME)[number];
  if (request.imageBase64 && !SUPPORTED_MIME.includes(request.mimeType as SupportedMime)) {
    throw new Error(`Unsupported image type for Anthropic: ${request.mimeType}`);
  }

  const imageContent = request.imageBase64
    ? {
        type: 'image',
        source: {
          type: 'base64',
          media_type: request.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: request.imageBase64,
        },
      }
    : { type: 'image', source: { type: 'url', url: request.imageUrl } };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [imageContent, { type: 'text', text: request.prompt }],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error(`Anthropic returned no text`);
  return { altText: text.trim(), source: 'anthropic' };
}

async function generateWithOpenAI(
  request: InferenceRequest,
  apiKey: string,
): Promise<InferenceResult> {
  if (!apiKey) throw new Error('OpenAI API key not configured');

  const imageUrl = request.imageBase64
    ? `data:${request.mimeType};base64,${request.imageBase64}`
    : request.imageUrl;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: request.prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(`OpenAI returned no text`);
  return { altText: text.trim(), source: 'openai' };
}

async function generateWithGemini(
  request: InferenceRequest,
  apiKey: string,
): Promise<InferenceResult> {
  if (!apiKey) throw new Error('Gemini API key not configured');

  if (!request.imageBase64) {
    throw new Error('gemini: imageBase64 is required; CORS-blocked images cannot be processed via Gemini');
  }
  const imagePart = { inlineData: { mimeType: request.mimeType, data: request.imageBase64 } };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [imagePart, { text: request.prompt }] }],
        generationConfig: { maxOutputTokens: 256 },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error(`Gemini returned no text (finishReason=${data?.candidates?.[0]?.finishReason ?? 'unknown'})`);
  }
  return { altText: text.trim(), source: 'gemini' };
}

async function generateWithCustomEndpoint(
  request: InferenceRequest,
  endpoint: string,
  apiKey: string,
): Promise<InferenceResult> {
  if (!endpoint) throw new Error('Custom endpoint URL not configured');

  const imageUrl = request.imageBase64
    ? `data:${request.mimeType};base64,${request.imageBase64}`
    : request.imageUrl;

  const response = await fetch(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: request.prompt },
          ],
        },
      ],
      max_tokens: 256,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Custom API error ${response.status}: ${body}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error(`Custom API returned no text`);
  return { altText: text.trim(), source: 'custom' };
}
