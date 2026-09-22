# Kingshot Alliance - Supabase Integration Complete ✅

## What Was Done

Your player management system has been completely rewritten to use Supabase as the primary database with session storage for real-time caching. Players are now fetched from the Kingshot API instead of being manually entered.

## Key Changes

### 1. **Database Layer**
- ❌ Removed: localStorage + JSON files (old system)
- ✅ Added: Supabase PostgreSQL database
- ✅ Added: Session storage for caching and offline support

### 2. **Add Player Modal** (Simplified ✨)
- **Before**: Form with 7 fields (playerId, name, alias, swordland, triAlliance, power, active)
- **After**: Single input field for Player ID only!
  - Enter the player's in-game ID
  - System fetches all data from Kingshot API automatically
  - If fetch succeeds → Player added to database
  - Shows error if player not found

### 3. **Edit Player Modal** (Enhanced 🔄)
- Full player data displayed (read-only)
- **New Refetch Button**: Click to get latest data from Kingshot API
- Updated data automatically saves to database
- All data syncs to session storage

### 4. **Data Management**
- **Load**: Supabase (primary) → Session Storage (backup)
- **Add**: Kingshot API → Supabase → Session Storage
- **Edit**: Refetch from API → Supabase → Session Storage
- **Delete**: Supabase (soft delete) → Remove from Session Storage

## New Utilities Created

### `src/utils/supabaseClient.ts`
Initializes Supabase connection with your credentials

### `src/utils/kingshotApi.ts`
Handles fetching player data from: `https://kingshot.net/api/player-info?playerId=`

Expected response format:
```json
{
  "playerId": "123456",
  "name": "Player Name",
  "alias": "Player Alias", 
  "swordlandPower": 1702,
  "trialliancePower": 232,
  "power": 243091266
}
```

### `src/utils/sessionStorageService.ts`
Manages session storage operations:
- `getSessionPlayers()` - Retrieve cached players
- `setSessionPlayers()` - Cache players
- `upsertSessionPlayer()` - Add/update single player
- `removeSessionPlayer()` - Remove player from cache
- `clearSessionPlayers()` - Clear all cache

## What You Need To Do

### 1. **Get Supabase Credentials**
- Sign up at https://supabase.com (free tier available)
- Create a new project
- Go to Settings → API
- Copy `Project URL` and `anon public` key

### 2. **Create Database Table**
In Supabase SQL Editor, run:
```sql
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  playerId VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  alias VARCHAR(255),
  swordlandPower INTEGER DEFAULT 0,
  trialliancePower INTEGER DEFAULT 0,
  power BIGINT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_players_playerId ON players(playerId);
CREATE INDEX idx_players_active ON players(active);
```

### 3. **Fill Environment Variables**
Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. **Test It**
```bash
npm run dev
```
- Navigate to Players page
- Click "Add Player"
- Enter a valid Kingshot player ID
- System should fetch and add the player automatically!

## Architecture Flow

```
┌─────────────────────────────────────────────────────────┐
│                   Players Page                           │
└────────────┬────────────────────────────────────────┬───┘
             │                                        │
        Load Players                            Add/Edit Player
             │                                        │
        ┌────▼─────────────────┐               ┌─────▼──────────────┐
        │  Supabase Database   │               │  Kingshot API      │
        │  (Primary Source)    │               │  (Data Source)     │
        └────┬────────┬────────┘               └─────┬──────────────┘
             │        │                              │
        ┌────▼────┐   └──────────────────────────────┘
        │ Session │
        │ Storage │  (Real-time cache & offline fallback)
        └─────────┘
```

## Example Usage

### Adding a Player:
1. Click "+ Add Player"
2. Enter Player ID: `121398024`
3. Click "Add Player"
4. ✅ System fetches from Kingshot API and creates player in database

### Editing a Player:
1. Click ✎ (edit icon) on a player
2. Click "Refetch" button to get latest stats
3. Click "Update Player" to save

### Deleting a Player:
1. Click ✕ (delete icon)
2. Confirm deactivation
3. Player removed from view (soft deleted in database)

## Session Storage Details

- **Scope**: Per browser tab (cleared when you close the tab)
- **Usage**: Real-time UI updates + offline fallback
- **Auto-sync**: Every database operation updates session storage
- **Reload**: Data is always reloaded from Supabase on page refresh
- **Fallback**: If Supabase unavailable, session storage provides cached data

## Files Changed

| File | Change | Details |
|------|--------|---------|
| `src/utils/playerService.ts` | ♻️ Rewritten | Now uses Supabase, all async |
| `src/components/PlayerForm.tsx` | ♻️ Rewritten | Simplified + refetch button |
| `src/app/players/page.tsx` | ♻️ Rewritten | Handles async + session storage |
| `src/types/index.ts` | 📝 Updated | Added created_at, updated_at |
| `src/components/PlayerForm.module.css` | 📝 Updated | New error & refetch styles |
| `.env.local` | ✨ New | Config file (needs your credentials) |
| `src/utils/supabaseClient.ts` | ✨ New | Supabase initialization |
| `src/utils/kingshotApi.ts` | ✨ New | API integration |
| `src/utils/sessionStorageService.ts` | ✨ New | Session storage utilities |
| `SETUP_GUIDE.md` | ✨ New | Detailed setup instructions |

## Removed

- ❌ `src/utils/playersFileService.ts` (no longer needed)
- ❌ localStorage dependency on playerService.ts
- ❌ players.json as primary data source
- ❌ Local form validation logic (API provides real data)

## Error Handling

The system now includes comprehensive error handling:
- ✅ Supabase connection errors
- ✅ Kingshot API errors  
- ✅ Invalid player IDs
- ✅ Network timeouts
- All errors display user-friendly messages

## Performance

- **Session storage**: Instant reads (no network delay)
- **Database queries**: Indexed on playerId and active status
- **API calls**: Only on add/edit/refetch (not on every load)
- **Offline support**: Works with cached session storage data

## Security Notes

Currently using public anon key for testing. For production:
1. Enable Row Level Security (RLS) in Supabase
2. Restrict table access with policies
3. Consider Supabase Auth for user management
4. Validate all inputs server-side

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to load players" | Check `.env.local` credentials, verify table exists |
| Player not found | Verify Player ID is correct, check Kingshot API is accessible |
| Session storage empty | Session storage clears on browser close - reload page to resync from Supabase |
| API returns error | Check if https://kingshot.net/api is accessible, verify response format |

## Next Steps

1. ✅ Follow the setup guide above
2. ✅ Test adding/editing/deleting players
3. ✅ Verify data syncs correctly
4. ✅ Consider RLS security setup for production
5. ✅ Consider adding real-time updates with Supabase Realtime

---

**Ready to go!** 🚀 Once you fill in your Supabase credentials in `.env.local`, everything should work seamlessly!
