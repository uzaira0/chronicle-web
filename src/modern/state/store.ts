import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { type TypedUseSelectorHook, useSelector } from 'react-redux';

import { bootstrapSession, loginWithPassword, sessionListenerMiddleware, sessionReducer } from '@/state/session-slice';
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
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(sessionListenerMiddleware.middleware).concat(studyOperationsApi.middleware),
});
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;

sessionListenerMiddleware.startListening({
  predicate: (action) => loginWithPassword.fulfilled.match(action) || bootstrapSession.fulfilled.match(action),
  effect: (_action, api) => {
    const previous = (api.getOriginalState() as RootState).session.user?.id;
    const current = (api.getState() as RootState).session.user?.id;
    if (previous !== current) api.dispatch(studyOperationsApi.util.resetApiState());
  },
});

export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
