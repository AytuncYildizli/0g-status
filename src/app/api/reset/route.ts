/**
 * Reset API - clears stale history data
 * Call with ?confirm=yes to actually reset
 */
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const confirm = searchParams.get('confirm');

  if (confirm !== 'yes') {
    return NextResponse.json({
      message: 'Add ?confirm=yes to reset all history data',
      warning: 'This will clear all hourly/daily/monthly aggregates and all-time stats'
    });
  }

  try {
    // Clear raw history
    await kv.del('status:history');

    // Clear all-time stats
    await kv.del('status:alltime');

    // Get and clear all hourly/daily/monthly keys
    const keys = await kv.keys('status:*');
    if (keys.length > 0) {
      await Promise.all(keys.map(k => kv.del(k)));
    }

    return NextResponse.json({
      success: true,
      message: 'All history data cleared',
      keysDeleted: keys.length + 2,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
