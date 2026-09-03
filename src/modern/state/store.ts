import { configureStore } from '@reduxjs/toolkit';
import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { sessionReducer } from '@/state/session-slice';
import { studyOperationsApi } from '@/state/study-operations-api';

// Bun's production browser bundle does not provide Vite's `import.meta.env`.
// Keep this optional even though Bun's server-side type declarations expose it.
const isDevMode = import.meta.env?.DEV === true;

export const store = configureStore({
  reducer: {
    session: sessionReducer,
    [studyOperationsApi.reducerPath]: studyOperationsApi.reducer,
  },
  devTools: isDevMode,
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(studyOperationsApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
