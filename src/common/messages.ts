// ============================================
// OUI-CRM - Centralized API Messages
// ============================================


const errorDefinitions = {
  // Validation
  INVALID_DATA: 'Invalid data',
  INVALID_CUID: (value: string) => `Validation failed (CUID expected): ${value}`,
  // Internal
  INTERNAL_ERROR: 'Internal server error',
 UNAUTHORIZED: 'Unauthorized access',
} as const;

type ErrorKey = keyof typeof errorDefinitions;

export const ApiMessages = {
  errors: {
    code: Object.fromEntries(Object.keys(errorDefinitions).map((k) => [k, k])) as Record<
      ErrorKey,
      string
    >,
    message: errorDefinitions,
  },



  swagger: {
    title: 'OUI-CRM API Documentation',
    description: 'API documentation for the OUI-CRM application',
  },
};
