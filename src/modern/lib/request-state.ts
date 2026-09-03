export type RequestState = 'FAILURE' | 'PENDING' | 'STANDBY' | 'SUCCESS';

export const REQUEST_STATES = {
  FAILURE: 'FAILURE',
  PENDING: 'PENDING',
  STANDBY: 'STANDBY',
  SUCCESS: 'SUCCESS',
} as const satisfies Record<string, RequestState>;

export function getMutationRequestState(options: {
  isError: boolean;
  isLoading: boolean;
  isSuccess: boolean;
}): RequestState {
  if (options.isLoading) return REQUEST_STATES.PENDING;
  if (options.isSuccess) return REQUEST_STATES.SUCCESS;
  if (options.isError) return REQUEST_STATES.FAILURE;
  return REQUEST_STATES.STANDBY;
}
