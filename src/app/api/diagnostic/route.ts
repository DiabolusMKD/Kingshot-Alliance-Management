import { NextRequest, NextResponse } from 'next/server';
import { KINGSHOT_REDEEM_ACTION_ID, KINGSHOT_REDEEM_URL, fetchKingshotPlayerViaRedeem } from '@/utils/kingshotRedeem';

/**
 * Diagnostic endpoint to check external API connectivity and configuration
 * Useful for troubleshooting Vercel deployment issues
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const testPlayerId = '121398024'; // Known-valid player ID for testing

  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    kingshotRedeemUrl: KINGSHOT_REDEEM_URL,
    kingshotRedeemActionId: KINGSHOT_REDEEM_ACTION_ID,
    actionIdSource: process.env.KINGSHOT_REDEEM_ACTION_ID ? 'env' : 'default',
    testPlayerId,
  };

  try {
    // Test with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const { httpResponse, rawText, parsed } = await fetchKingshotPlayerViaRedeem(testPlayerId);

    clearTimeout(timeout);

    diagnostics.httpStatus = httpResponse.status;
    diagnostics.httpStatusText = httpResponse.statusText;
    diagnostics.contentType = httpResponse.headers.get('content-type');
    diagnostics.responseLength = rawText.length;
    diagnostics.responsePreview = rawText.substring(0, 500);

    if (httpResponse.status === 404) {
      diagnostics.likelyStaleActionId = true;
    }

    diagnostics.parsedOk = parsed !== null;
    if (parsed) {
      diagnostics.parsedStructure = {
        status: parsed.status,
        hasData: !!parsed.data,
        message: parsed.message,
      };
    }

    diagnostics.success = httpResponse.ok && parsed?.status === 'success';
  } catch (error) {
    diagnostics.success = false;
    diagnostics.error = error instanceof Error ? error.message : 'Unknown error';
    diagnostics.errorType = error instanceof Error ? error.constructor.name : typeof error;
  }

  return NextResponse.json(diagnostics);
}
