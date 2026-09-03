export function getStatusVariant(status: unknown) {
  switch (status) {
    case 'ENROLLED':
      return 'success' as const;
    case 'PAUSED':
      return 'warning' as const;
    case 'COLLECTION_COMPLETED':
      return 'default' as const;
    case 'NOT_ENROLLED':
      return 'destructive' as const;
    default:
      return 'muted' as const;
  }
}
