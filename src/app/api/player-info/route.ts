import { NextRequest, NextResponse } from 'next/server';
import { fetchKingshotPlayerViaRedeem, KINGSHOT_REDEEM_URL } from '@/utils/kingshotRedeem';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('playerId');

    if (!playerId) {
      return NextResponse.json(
        { error: 'Player ID is required', status: 'error' },
        { status: 400 }
      );
    }

    console.log('[API Route] Fetching player via redeem action:', KINGSHOT_REDEEM_URL, playerId);

    let result;
    try {
      result = await fetchKingshotPlayerViaRedeem(playerId);
      console.log('[API Route] Response status:', result.httpResponse.status);
    } catch (fetchError) {
      console.error('[API Route] Fetch failed:', fetchError);
      const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      return NextResponse.json(
        {
          error: `Failed to reach Kingshot API: ${errorMsg}`,
          status: 'error'
        },
        { status: 503 }
      );
    }

    const { httpResponse, rawText, parsed } = result;

    // Check HTTP status first
    if (!httpResponse.ok) {
      console.error('[API Route] Non-OK response:', httpResponse.status, rawText.substring(0, 500));
      if (httpResponse.status === 404) {
        // Most likely cause: kingshot.net redeployed and the Server Action id rotated.
        return NextResponse.json(
          { error: 'Kingshot lookup is temporarily unavailable (upstream action id changed)', status: 'error' },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: `HTTP ${httpResponse.status}: ${httpResponse.statusText}`, status: 'error' },
        { status: httpResponse.status }
      );
    }

    if (!parsed) {
      console.error('[API Route] Failed to parse redeem response:', rawText.substring(0, 500));
      return NextResponse.json(
        {
          error: 'Failed to parse Kingshot API response - received unexpected content',
          status: 'error',
          details: process.env.NODE_ENV === 'development' ? 'Check server logs for details' : undefined
        },
        { status: 502 }
      );
    }

    // Check if the API returned a failure status
    if (parsed.status === 'fail' || !parsed.data) {
      const errorMessage = parsed.message || 'Player not found';
      console.error('[API Route] API error status:', errorMessage);
      return NextResponse.json(
        { error: errorMessage, status: 'error' },
        { status: 400 }
      );
    }

    console.log('[API Route] Success:', { playerId: parsed.data.playerId, name: parsed.data.name });
    return NextResponse.json({ status: 'success', data: parsed.data, message: parsed.message });
  } catch (error) {
    console.error('[API Route] Unexpected error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch player data',
        status: 'error',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
