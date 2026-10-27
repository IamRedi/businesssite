export const abusePolicy = {
  ownerLogin: {
    network: { limit: 10, windowSeconds: 15 * 60 },
    identity: { limit: 5, windowSeconds: 15 * 60 },
  },
  siteAdminLogin: {
    network: { limit: 20, windowSeconds: 15 * 60 },
    account: { limit: 10, windowSeconds: 15 * 60 },
  },
  passwordReset: {
    network: { limit: 10, windowSeconds: 60 * 60 },
    account: { limit: 3, windowSeconds: 60 * 60 },
  },
  passwordChange: {
    network: { limit: 10, windowSeconds: 60 * 60 },
    token: { limit: 5, windowSeconds: 60 * 60 },
  },
  publicTrial: {
    network: { limit: 5, windowSeconds: 60 * 60 },
    email: { limit: 3, windowSeconds: 24 * 60 * 60 },
  },
  appointment: {
    network: { limit: 10, windowSeconds: 60 * 60 },
    siteNetwork: { limit: 5, windowSeconds: 10 * 60 },
    replay: { limit: 1, windowSeconds: 10 * 60 },
  },
  checkout: {
    network: { limit: 10, windowSeconds: 60 * 60 },
    resource: { limit: 3, windowSeconds: 60 * 60 },
  },
  websiteImport: {
    network: { limit: 10, windowSeconds: 60 * 60 },
    target: { limit: 20, windowSeconds: 60 * 60 },
  },
} as const;
