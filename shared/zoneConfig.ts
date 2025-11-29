export interface ZoneConfig {
  id: string;
  name: string;
  tier: number;
  description: string;
  unlockRequirement: {
    previousTier: number;
    delvesRequired: number;
  };
  portalFee: {
    arcaneAsh: number;
    crystallineAnimus: number;
  };
}

export const ZONES: ZoneConfig[] = [
  {
    id: 'roboka',
    name: 'Roboka',
    tier: 1,
    description: 'The starting town and surrounding wilderness',
    unlockRequirement: {
      previousTier: 0,
      delvesRequired: 0,
    },
    portalFee: {
      arcaneAsh: 500,
      crystallineAnimus: 0,
    },
  },
  {
    id: 'fungal_hollows',
    name: 'Fungal Hollows',
    tier: 2,
    description: 'A dark underground realm filled with deadly fungi',
    unlockRequirement: {
      previousTier: 1,
      delvesRequired: 5,
    },
    portalFee: {
      arcaneAsh: 950,
      crystallineAnimus: 0,
    },
  },
  {
    id: 'crystal_groves',
    name: 'Crystal Groves',
    tier: 3,
    description: 'Ancient crystalline forests pulsing with arcane energy',
    unlockRequirement: {
      previousTier: 2,
      delvesRequired: 10,
    },
    portalFee: {
      arcaneAsh: 1200,
      crystallineAnimus: 5,
    },
  },
  {
    id: 'the_borderlands',
    name: 'The Borderlands',
    tier: 4,
    description: 'The chaotic frontier where reality begins to fray',
    unlockRequirement: {
      previousTier: 3,
      delvesRequired: 20,
    },
    portalFee: {
      arcaneAsh: 1500,
      crystallineAnimus: 10,
    },
  },
  {
    id: 'shattered_forge',
    name: 'The Shattered Forge',
    tier: 5,
    description: 'The remnants of an ancient forge corrupted by the Void',
    unlockRequirement: {
      previousTier: 4,
      delvesRequired: 50,
    },
    portalFee: {
      arcaneAsh: 2500,
      crystallineAnimus: 20,
    },
  },
];

export function getZoneById(id: string): ZoneConfig | undefined {
  return ZONES.find(zone => zone.id === id);
}

export function getZoneByTier(tier: number): ZoneConfig | undefined {
  return ZONES.find(zone => zone.tier === tier);
}

export function getUnlockableZones(): ZoneConfig[] {
  return ZONES.filter(zone => zone.tier > 1);
}

export function isZoneUnlockable(
  zone: ZoneConfig,
  delvesCompletedByTier: { tier1: number; tier2: number; tier3: number; tier4: number; tier5: number }
): boolean {
  const previousTier = zone.unlockRequirement.previousTier;
  if (previousTier === 0) return true;
  
  const tierKey = `tier${previousTier}` as keyof typeof delvesCompletedByTier;
  const delvesCompleted = delvesCompletedByTier[tierKey] || 0;
  
  return delvesCompleted >= zone.unlockRequirement.delvesRequired;
}

export function getDelveProgress(
  zone: ZoneConfig,
  delvesCompletedByTier: { tier1: number; tier2: number; tier3: number; tier4: number; tier5: number }
): { completed: number; required: number } {
  const previousTier = zone.unlockRequirement.previousTier;
  if (previousTier === 0) return { completed: 0, required: 0 };
  
  const tierKey = `tier${previousTier}` as keyof typeof delvesCompletedByTier;
  const delvesCompleted = delvesCompletedByTier[tierKey] || 0;
  
  return {
    completed: delvesCompleted,
    required: zone.unlockRequirement.delvesRequired,
  };
}
