// ============================================
// OUI-CRM - Centralized API Messages
// All user-facing strings: error codes/messages and Swagger summaries.
// Codes are UPPER_SNAKE; messages with arguments are arrow functions.
// ============================================

const errorDefinitions = {
  // Generic
  INVALID_DATA: 'Invalid data',
  INVALID_CUID: (value: string) => `Validation failed (CUID expected): ${value}`,
  INTERNAL_ERROR: 'Internal server error',
  UNAUTHORIZED: 'Unauthorized access',
  ACCESS_DENIED: 'Access denied',
  EMPTY_UPDATE_PAYLOAD: 'Update payload is empty',
  INVALID_STATUS_TRANSITION: (from: string) => `Invalid status transition from ${from}`,
  CONFIG_MISSING: (key: string) => `${key} is not configured`,
  INVALID_CUID_FIELD: (field: string, each: boolean) =>
    each ? `each value in ${field} must be a valid CUID` : `${field} must be a valid CUID`,

  // Auth & sessions
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password',
  AUTH_ACCOUNT_LOCKED: (until: string) => `Account locked until ${until}`,
  AUTH_ACCOUNT_NOT_ACTIVE: 'Account is not active',
  TOKEN_EXPIRED: 'Access token expired',
  REFRESH_TOKEN_INVALID_OR_EXPIRED: 'Refresh token is invalid or expired',
  REFRESH_TOKEN_INVALID_OR_USED: 'Refresh token is invalid or has already been used',
  SESSION_NOT_FOUND: 'Session not found',
  JWT_ACCESS_SECRET_MISSING: 'JWT_ACCESS_SECRET is not configured',

  // Guards (project & permissions)
  PROJECT_IS_REQUIRED: (header: string) => `${header} header is required`,
  PROJECT_MISMATCH: 'You do not have access to this project',
  USER_HAS_NO_PROJECT: 'User is not assigned to any project',
  FEATURE_NOT_ENABLED: (feature: string) => `Feature ${feature} is not enabled for this project`,

  // Activation / password reset / e-mail change
  ACTIVATION_TOKEN_INVALID: 'Activation token is invalid',
  ACTIVATION_TOKEN_EXPIRED: 'Activation token has expired; a new one has been sent',
  ACTIVATION_TOKEN_SECRET_MISSING: 'ACTIVATION_CRYPTR_SECRET is not configured',
  LEGAL_CONSENT_REQUIRED: 'CGU and RGPD consent is required',
  PASSWORD_RESET_TOKEN_INVALID: 'Password reset token is invalid',
  PASSWORD_RESET_TOKEN_EXPIRED: 'Password reset token has expired',
  PASSWORD_RESET_TOKEN_SECRET_MISSING: 'PASSWORD_RESET_CRYPTR_SECRET is not configured',
  PASSWORD_TOO_WEAK: (minLength: number) =>
    `Password must be at least ${minLength} characters with letters and digits`,
  PASSWORD_MUST_BE_DIFFERENT_FROM_OLD: 'New password must differ from the current one',
  OLD_PASSWORD_MISMATCH: 'Current password is incorrect',
  EMAIL_UNCHANGED: 'New e-mail is identical to the current one',
  EMAIL_ALREADY_TAKEN: 'This e-mail is already in use',
  EMAIL_CHANGE_TOKEN_NOT_FOUND: 'E-mail change token not found',
  EMAIL_CHANGE_TOKEN_EXPIRED: 'E-mail change token has expired',
  EMAIL_CHANGE_TOKEN_SECRET_MISSING: 'EMAIL_CHANGE_CRYPTR_SECRET is not configured',
  EMAIL_SEND_FAILED: 'E-mail could not be sent',

  // Users & roles
  USER_NOT_FOUND: 'User not found',
  EMAIL_EXISTS_FOR_PROJECT: 'This user is already assigned to the project',
  INVALID_ROLE: 'Role not found or not allowed',
  ROLE_NOT_FOUND: (id: string) => `Role ${id} not found`,
  ROLE_IS_SYSTEM: 'System roles cannot be modified',
  ROLE_CODE_EXISTS: 'A role with this code already exists in the project',
  ROLE_IN_USE: 'Role is assigned to users and cannot be deleted',
  CANNOT_UPDATE_OWN_ACCESS: 'You cannot change your own scope, expiration or permissions',
  CANNOT_UPDATE_OWN_ROLE: 'You cannot change your own role',
  CANNOT_DELETE_SELF: 'You cannot delete your own account',
  USER_IS_LAST_ADMIN: 'Cannot remove the last project administrator',
  USER_ALREADY_ACTIVE: 'User is already active',
  USER_INACTIVE: 'User is inactive',
  USER_AVATAR_NOT_SET: 'User has no avatar',
  EXPIRATION_REQUIRED_FOR_EXTERNAL: 'External accounts require an expiration date',
  INITIALS_ALREADY_USED: 'These initials are already used in this project',
  PERMISSION_NOT_FOUND: (code: string) => `Permission ${code} not found`,

  // Projects
  PROJECT_NOT_FOUND: (id: string) => `Project ${id} not found`,
  PROJECT_SLUG_EXISTS: 'A project with this slug already exists',
  PROJECT_NAME_MISMATCH: 'Project name does not match. Operation aborted.',
  PROJECT_NOT_ACTIVE: 'Project is not active',
  PROJECT_ARCHIVED: 'Project is archived',

  // Scopes, settings, references
  SCOPE_NOT_FOUND: (id: string) => `Scope ${id} not found`,
  SCOPE_IN_USE: 'Scope is assigned to users and cannot be deleted',
  SCOPE_NAME_EXISTS: 'A scope with this name already exists in the project',
  SETTINGS_NOT_FOUND: 'Project settings not found',
  STAGE_PROBABILITY_FIXED: 'WON and LOST probabilities cannot be changed',
  REFERENCE_ITEM_NOT_FOUND: (id: string) => `Reference item ${id} not found`,
  REFERENCE_KEY_EXISTS: 'A reference item with this key already exists in this category',
  TEMPLATE_INVALID: (issues: string) => `Template is invalid: ${issues}`,
  SIGNATURE_IMAGE_NOT_SET: 'No signature image configured for this project',

  // Storage & files
  STORAGE_FILE_TOO_LARGE: (max: string) => `File exceeds the maximum size (${max})`,
  STORAGE_INVALID_MIME_TYPE: 'File type is not allowed for this category',
  STORAGE_INVALID_MAGIC_BYTES: 'File content does not match its declared type',
  STORAGE_OBJECT_NOT_FOUND: (key: string) => `Stored object not found: ${key}`,
  STORAGE_UPLOAD_FAILED: 'File upload failed',
  STORAGE_ACCESS_DENIED: 'You are not allowed to access this file',
  STORAGE_CONTEXT_UNSUPPORTED: 'Unsupported storage context',
  STORAGE_FILE_REQUIRED: 'A file is required',
  FILE_NOT_FOUND: (id: string) => `File ${id} not found`,
  FILE_RETENTION_LOCKED: 'This file is kept for legal retention and cannot be deleted',
  FILE_OWNER_CATEGORY_MISMATCH: 'File category is not compatible with this owner type',
  FILE_OWNER_NOT_FOUND: 'File owner not found',
  FILE_OWNER_TYPE_NOT_SUPPORTED: (ownerType: string) =>
    `File owner type ${ownerType} is not supported yet`,
  FILE_PROJECT_ID_REQUIRED: 'projectId is required for this file',
  FILE_PROJECT_ID_FORBIDDEN: 'projectId must be null for user files',
  FILE_PROJECT_OWNER_MISMATCH: 'Owner project does not match the current project',
  FILENAME_INVALID_CHARS: 'File name contains invalid characters',

} as const;

type ErrorKey = keyof typeof errorDefinitions;

/** User-facing labels that are not error messages (domain wording, French). */
export const labels = {
  auditObjects: {
    settings: 'Réglages',
  },
} as const;

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
    projectIdHeaderDesc:
      'Project ID - Required. Backoffice users can target any project; project users must specify a project they are assigned to',

    responses: {
      success: 'Success',
      created: 'Created successfully',
      deleted: 'Deleted',
      notFound: 'Resource not found',
      invalidData: 'Invalid request data',
      conflict: 'Resource already exists',
      attachment: 'File download (attachment)',
      unauthorized: 'Missing, invalid or expired access token',
      forbidden: 'Insufficient permissions, or project not accessible to the user',
    },

    params: {
      userId: 'User unique identifier (CUID)',
      roleId: 'Role unique identifier (CUID)',
      scopeId: 'Scope unique identifier (CUID)',
      projectId: 'Project unique identifier (CUID)',
      fileId: 'File unique identifier (CUID)',
      referenceItemId: 'Reference item unique identifier (CUID)',
      templateType: 'Document template type (QUOTE | CONTRACT)',
    },

    health: {
      tag: 'Health',
      check: { summary: 'Health check', description: 'Returns ok when the API is up' },
    },

    auth: {
      tag: 'Auth',
      login: {
        summary: 'User login',
        description: 'Authenticates a user and returns access and refresh tokens',
      },
      refresh: {
        summary: 'Renew session using a refresh token',
        description:
          'Renews the user session by validating a refresh token and issuing new access and refresh tokens.',
      },
      logout: {
        summary: 'Logout user',
        description:
          'Revokes the current session. Returns 401 if the session was already terminated.',
      },
      activationValidate: {
        summary: 'Validate activation token',
        description: 'Checks if the activation token is valid and returns the legal documents to accept.',
      },
      activationComplete: {
        summary: 'Complete account activation',
        description:
          'Sets the password and activates the account. Requires acceptCgu=true and acceptRgpd=true; the server stamps the current CGU and RGPD versions in the same transaction.',
      },
      passwordResetRequest: {
        summary: 'Request password reset',
        description:
          'Sends a password reset e-mail if a matching ACTIVE user exists. Always returns 200 to avoid leaking whether the e-mail exists.',
      },
      passwordResetValidate: {
        summary: 'Validate password reset token',
        description: 'Checks whether the provided password reset token is valid and not expired.',
      },
      passwordResetComplete: {
        summary: 'Complete password reset',
        description: 'Validates the reset token, sets the new password and invalidates the token.',
      },
      emailChangeRequest: {
        summary: 'Request an e-mail change',
        description:
          'Verifies the current password, then sends a confirmation link to the new e-mail address. The change is applied on confirmation.',
      },
      emailChangeConfirm: {
        summary: 'Confirm an e-mail change',
        description: 'Applies the e-mail change carried by the confirmation token.',
      },
    },

    legal: {
      tag: 'Legal',
      accept: {
        summary: 'Accept legal documents',
        description: 'Stamps the current versions of the documents the user must re-accept',
      },
    },

    profile: {
      tag: 'Profile',
      me: {
        summary: 'Current user, profile and project accesses',
        description:
          'Single profile read: identity, phone, avatar URL, contact type (BACKOFFICE or PROJECT), one relation per project with role, effective permissions (already corrected by overrides), features and geographic scope, plus the legal re-acceptance state.',
      },
      update: { summary: 'Update profile', description: 'Updates first name, last name and phone' },
      changePassword: {
        summary: 'Change password',
        description: 'Changes the password after verifying the current one',
      },
      uploadAvatar: { summary: 'Upload avatar', description: 'Replaces the user avatar (JPEG/PNG, 2 MB max)' },
      deleteAvatar: { summary: 'Delete avatar', description: 'Removes the user avatar' },
    },

    projects: {
      tag: 'Projects',
      list: { summary: 'List projects', description: 'Backoffice only. Paginated list of projects' },
      findOne: { summary: 'Get project by ID', description: 'Backoffice only' },
      create: {
        summary: 'Create project',
        description:
          'Creates a project and bootstraps its default configuration (settings, reference items, default scope, features, empty pricing grid). Optionally copies the configuration of another project.',
      },
      update: { summary: 'Update project', description: 'Partial update of a project (the slug is immutable)' },
      changeStatus: {
        summary: 'Change project status',
        description:
          'Transitions: DRAFT → ACTIVE (opens the project to its users), ACTIVE → ARCHIVED (the project name must be re-typed as confirmation; its users lose access), ARCHIVED → ACTIVE (restore). Any other transition is refused (409).',
      },
      features: { summary: 'Update project features', description: 'Enables or disables features for a project' },
      configExport: {
        summary: 'Export project configuration',
        description:
          'Returns an XLSX workbook with the project configuration in the PROJECT_CONFIG import layout: Settings, StageProbabilities, ReferenceItems, Scopes and Users (assignments: e-mail, name, role, scope, initials)',
      },
    },

    users: {
      tag: 'Users',
      list: { summary: 'List project users', description: 'Paginated list of users assigned to the project' },
      findOne: { summary: 'Get user by ID', description: 'Returns a project user with its effective permissions' },
      create: {
        summary: 'Create user',
        description:
          'Creates a user (PENDING) and sends an activation e-mail, assigns an existing user to the project, or reactivates a suspended assignment',
      },
      update: { summary: 'Update user', description: 'Updates role, scope, expiration or identity fields' },
      overrides: {
        summary: 'Set permission overrides',
        description: 'Adds or removes permissions for this user in this project (removal > addition > role)',
      },
      resendActivation: { summary: 'Resend activation e-mail', description: 'Sends a new activation e-mail to a PENDING user' },
      delete: { summary: 'Remove user from project', description: 'Suspends the assignment and revokes sessions' },
    },

    usersBackoffice: {
      tag: 'Backoffice users',
      roles: { summary: 'List backoffice roles', description: 'System roles assignable to a backoffice account' },
      list: { summary: 'List backoffice users', description: 'Paginated platform accounts (no project)' },
      findOne: { summary: 'Get backoffice user by ID', description: 'Returns a backoffice account' },
      create: {
        summary: 'Create backoffice user',
        description: 'Creates a dedicated backoffice account (PENDING) and sends an activation e-mail, or reactivates a suspended one',
      },
      update: { summary: 'Update backoffice user', description: 'Updates identity fields or the backoffice role' },
      resendActivation: { summary: 'Resend activation e-mail', description: 'Sends a new activation e-mail to a PENDING backoffice user' },
      delete: { summary: 'Remove backoffice user', description: 'Suspends the backoffice access and revokes sessions' },
    },

    roles: {
      tag: 'Roles',
      list: { summary: 'List roles', description: 'System roles and roles of the current project, with permissions' },
      permissions: { summary: 'List permissions', description: 'Catalogue of all permissions grouped by module' },
      duplicate: { summary: 'Duplicate role', description: 'Creates an editable copy of a role in the current project' },
      update: { summary: 'Update role', description: 'Updates label, out-of-scope access and permissions of a project role' },
      delete: { summary: 'Delete role', description: 'Deletes a project role not assigned to any user' },
    },

    scopes: {
      tag: 'Scopes',
      list: { summary: 'List scopes', description: 'Geographic scopes of the project' },
      create: { summary: 'Create scope', description: 'Creates a geographic scope' },
      update: { summary: 'Update scope', description: 'Updates a geographic scope' },
      delete: { summary: 'Delete scope', description: 'Deletes a scope not assigned to any user' },
      regions: { summary: 'List regions', description: 'Static list of regions with their departments' },
    },

    settings: {
      tag: 'Settings',
      get: { summary: 'Get project settings', description: 'Returns settings, stage probabilities and company identity' },
      update: { summary: 'Update project settings', description: 'Partial update of project settings' },
      documents: { summary: 'List document templates', description: 'Active HTML templates and signature image' },
      uploadTemplate: {
        summary: 'Upload document template',
        description: 'Uploads a new HTML template version for a document type; validates required tags',
      },
      uploadSignature: { summary: 'Upload signature image', description: 'Uploads the stamp + signature image (PNG/JPEG, 2 MB max); replaces the previous one' },
      deleteSignature: { summary: 'Delete signature image', description: 'Removes the stamp + signature image of the project' },
    },

    referenceItems: {
      tag: 'Reference items',
      list: { summary: 'List reference items', description: 'Reference values of the project, optionally filtered by category' },
      create: { summary: 'Create reference item', description: 'Adds a value to a reference category' },
      update: { summary: 'Update reference item', description: 'Updates label, order, metadata or active flag' },
    },

    auditLog: {
      tag: 'Audit log',
      list: {
        summary: 'List audit log entries',
        description: 'Newest first; filterable by calendar-day period, user, action code, object type and object id',
      },
    },

    files: {
      tag: 'Files',
      download: {
        summary: 'Get file download URL',
        description: 'Returns a short-lived presigned URL for a file the user is allowed to read',
      },
      delete: { summary: 'Delete file', description: 'Deletes a file the user is allowed to delete' },
    },
  },
};
