import { configureStore } from '@reduxjs/toolkit';
import { studyOperationsApi } from '@/state/study-operations-api';

export function createApiStore() {
  return configureStore({
    reducer: { [studyOperationsApi.reducerPath]: studyOperationsApi.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
  });
}
