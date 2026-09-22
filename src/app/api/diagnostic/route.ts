import { NextRequest, NextResponse } from 'next/server';

/**
 * Diagnostic endpoint to check external API connectivity and configuration
 * Useful for troubleshooting Vercel deployment issues
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const kingshotApiUrl = process.env.NEXT_PUBLIC_KINGSHOT_API_URL || 'https://kingshot.net/api';
  const testPlayerId = '1'; // Use a generic player ID for testing

  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    kingshotApiUrl,
    configuredUrl: process.env.NEXT_PUBLIC_KINGSHOT_API_URL || 'NOT_SET_-_USING_DEFAULT',
  };

  try {
    const testUrl = `${kingshotApiUrl}/player-info?playerId=${testPlayerId}`;
    diagnostics.testUrl = testUrl;
    diagnostics.testPlayerId = testPlayerId;

    // Test with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(testUrl, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'kingshot-alliance-management/1.0'
      }
    });
    
    clearTimeout(timeout);

    diagnostics.httpStatus = response.status;
    diagnostics.httpStatusText = response.statusText;
    diagnostics.contentType = response.headers.get('content-type');
    diagnostics.responseHeaders = Object.fromEntries(response.headers.entries());

    // Try to get response text
    const responseText = await response.text();
    diagnostics.responseLength = responseText.length;
    diagnostics.responsePreview = responseText.substring(0, 500);

    // Try to parse as JSON
    try {
      const jsonData = JSON.parse(responseText);
      diagnostics.isValidJson = true;
      diagnostics.jsonStructure = {
        hasStatus: 'status' in jsonData,
        hasData: 'data' in jsonData,
        hasMessage: 'message' in jsonData,
        keys: Object.keys(jsonData)
      };
    } catch (e) {
      diagnostics.isValidJson = false;
      diagnostics.jsonError = e instanceof Error ? e.message : 'Failed to parse';
      diagnostics.looksLikeHtml = responseText.includes('<!DOCTYPE') || responseText.includes('<html');
    }

    diagnostics.success = true;
  } catch (error) {
    diagnostics.success = false;
    diagnostics.error = error instanceof Error ? error.message : 'Unknown error';
    diagnostics.errorType = error instanceof Error ? error.constructor.name : typeof error;
  }

  return NextResponse.json(diagnostics);
}
