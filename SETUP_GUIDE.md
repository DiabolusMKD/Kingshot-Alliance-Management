# Supabase + Kingshot API Integration Setup Guide

## Overview
Your player management system has been rewritten to use Supabase as the main database with session storage for real-time caching. Players are now fetched from the Kingshot API (https://kingshot.net/api) when added or refetched.

## Prerequisites
1. A Supabase account (free tier available at https://supabase.com)
2. Node.js and npm installed

## Step 1: Create Supabase Project

1. Go to https://supabase.com and create an account
2. Create a new project
3. Once created, go to **Settings → API**
4. Copy your:
   - `Project URL` (NEXT_PUBLIC_SUPABASE_URL)
   - `anon public` key (NEXT_PUBLIC_SUPABASE_ANON_KEY)

## Step 2: Create Database Table

In your Supabase project, go to **SQL Editor** and run this query:

```sql
-- Create players table
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

-- Create index on playerId for faster lookups
CREATE INDEX idx_players_playerId ON players(playerId);
CREATE INDEX idx_players_active ON players(active);
```

## Step 3: Update Environment Variables

Edit `.env.local` in your project root and add your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## Step 4: Enable Row Level Security (Optional but Recommended)

For production, enable RLS in Supabase:

1. Go to **Authentication → Policies**
2. Enable RLS on the `player` table
3. Add a policy to allow all operations (for now):

```sql
CREATE POLICY "Allow all operations" ON player
  AS permissive
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

## How to Use

### Adding a Player
1. Click **+ Add Player** button
2. Enter the player's in-game **Player ID**
3. Click **Add Player**
4. The system will fetch player data from the Kingshot API
5. If successful, the player is added to the database and session storage

### Editing a Player
1. Click the edit icon (✎) next to a player
2. You can see the player's current data (read-only from API)
3. Click the **Refetch** button to get updated data from the Kingshot API
4. Click **Update Player** to save changes to the database
5. Updated data syncs to session storage

### Deleting a Player
1. Click the delete icon (✕) next to a player
2. Confirm the deletion
3. Player is deactivated (soft delete) - they won't appear in the list

## Data Flow

### Adding a Player:
```
Enter Player ID → Fetch from Kingshot API → Add to Supabase → Sync to Session Storage
```

### Editing a Player:
```
Click Refetch → Fetch latest from Kingshot API → Display data → Update Database → Sync to Session Storage
```

### Loading Players:
```
Load from Supabase (Primary) → Sync to Session Storage (Cache)
If Supabase fails → Use Session Storage as fallback
```

## Session Storage Behavior

- **Persistence**: Session storage is cleared when you close the browser tab
- **Real-time Sync**: Every database operation updates session storage immediately
- **Offline Fallback**: If Supabase is temporarily unavailable, session storage provides cached data
- **On Page Reload**: Data is reloaded from Supabase and synced to session storage

## API Integration (Kingshot)

The system fetches player data from: `https://kingshot.net/api/player-info?playerId={playerId}`

Expected response format:
```json
{
  "playerId": "121398024",
  "name": "Player Name",
  "alias": "Player Alias",
  "swordlandPower": 1702,
  "trialliancePower": 232,
  "power": 243091266
}
```

## Troubleshooting

### "Failed to load players. Please ensure Supabase credentials are set"
- Check that `.env.local` has correct Supabase credentials
- Ensure the `player` table exists in your database
- Verify the Supabase project is active

### Player data not fetching from Kingshot API
- Verify the Player ID is correct
- Check that https://kingshot.net/api is accessible
- The API might have changed format - check the response

### Session storage not working
- Clear browser cache/cookies
- Session storage only persists for the current session
- Data will be reloaded from Supabase on page refresh

## Next Steps (Optional Enhancements)

1. **Authentication**: Add Supabase Auth to restrict access
2. **Real-time Updates**: Enable Supabase Realtime to sync across tabs
3. **Backup**: Set up automated backups in Supabase
4. **Validation**: Add more input validation for player data
5. **Error Logging**: Implement better error tracking

## Files Modified/Created

### New Files:
- `src/utils/supabaseClient.ts` - Supabase client initialization
- `src/utils/sessionStorageService.ts` - Session storage utilities
- `src/utils/kingshotApi.ts` - Kingshot API integration
- `.env.local` - Environment variables

### Modified Files:
- `src/utils/playerService.ts` - Now uses Supabase instead of localStorage
- `src/types/index.ts` - Updated Player interface
- `src/components/PlayerForm.tsx` - Simplified to only playerId input + refetch button
- `src/app/players/page.tsx` - Updated to handle async operations
- `src/components/PlayerForm.module.css` - Added new styles

### Removed Dependencies:
- No longer uses `players.json` or localStorage
