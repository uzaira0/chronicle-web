import type { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';

import { ThemeProvider } from '@/components/theme-provider';
import { store } from '@/state/store';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <Provider store={store}>
      <ThemeProvider>{children}</ThemeProvider>
    </Provider>
  );
}
