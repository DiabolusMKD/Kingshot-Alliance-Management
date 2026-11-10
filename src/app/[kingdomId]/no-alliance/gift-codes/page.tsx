'use client';

import { use } from 'react';
import GiftCodesManager from '@/components/GiftCodesManager';
import { getUnassignedPlayers } from '@/utils/playerService';

interface NoAllianceGiftCodesPageProps {
  params: Promise<{ kingdomId: string }>;
}

/** Gift code redemption for the kingdom's players that are not in any alliance. */
export default function NoAllianceGiftCodesPage({ params }: NoAllianceGiftCodesPageProps) {
  const { kingdomId } = use(params);
  const kingdomIdNumber = Number(kingdomId);

  return (
    <GiftCodesManager
      loadPlayers={() => getUnassignedPlayers(kingdomIdNumber)}
      loadKey={`no-alliance:${kingdomIdNumber}`}
      groupLabel={`Kingdom ${kingdomId} players without an alliance`}
      backHref={`/${kingdomId}`}
      backLabel={`Back to Kingdom ${kingdomId}`}
      emptyPlayersText="Every player in this kingdom is in an alliance."
    />
  );
}
