import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { queryClient } from './query-client';
import { startCore } from './startup';

export function CoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void startCore();
  }, []);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
