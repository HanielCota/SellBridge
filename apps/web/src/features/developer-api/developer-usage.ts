/** Longest id kept in the usage trail; ids in this API are uuids or short text ids. */
const MAX_TRAIL_ID_LENGTH = 100;

export interface DeveloperUse {
  organizationId: string | null;
  resourceId: string | null;
  personalData: boolean;
}

function trailId(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  return value.slice(0, MAX_TRAIL_ID_LENGTH);
}

/**
 * What one call touched, for the usage trail: the organization and the record named in the path
 * (the last path parameter other than the organization), and whether buyer personal data went
 * out. Only a successful answer sends data, so a refused call never counts as personal data.
 */
export function describeDeveloperUse(input: {
  params: Readonly<Record<string, string>>;
  status: number;
  sendsPersonalData: boolean;
}): DeveloperUse {
  const { organizationId, ...others } = input.params;
  return {
    organizationId: trailId(organizationId),
    resourceId: trailId(Object.values(others).at(-1)),
    personalData: input.status === 200 && input.sendsPersonalData,
  };
}
