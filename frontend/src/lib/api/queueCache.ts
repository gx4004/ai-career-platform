export const QUEUE_QUERY_ROOT = ['queue'] as const

export function queuePacketsQueryKey(userId: string) {
  return [...QUEUE_QUERY_ROOT, userId, 'packets'] as const
}

export function queueStateQueryKey(userId: string) {
  return [...QUEUE_QUERY_ROOT, userId, 'state'] as const
}
