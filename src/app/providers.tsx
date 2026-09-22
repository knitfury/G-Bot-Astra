'use client';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { useEffect,useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { services } from '@/services';
import { useWorkspace } from '@/stores/workspace';
export function Providers({children}:{children:React.ReactNode}){const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}}));const theme=useWorkspace(s=>s.theme),reduced=useWorkspace(s=>s.reducedMotion);useEffect(()=>{services.hydrate();return services.subscribe(()=>{void client.invalidateQueries({queryKey:['snapshot']});});},[client]);useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion=reduced?'reduced':'full';},[theme,reduced]);return <QueryClientProvider client={client}><MotionConfig reducedMotion={reduced?'always':'user'}>{children}</MotionConfig></QueryClientProvider>;}
