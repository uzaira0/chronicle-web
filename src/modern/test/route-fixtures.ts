import { createRoutesFromElements } from 'react-router';
import { modernRouteElements } from '@/app/router';

// Read the shipped route table so a newly routed page automatically enters the route regressions.
// The pathless root (title, unsaved-edits guard, boundary) needs a data router; tests mount its children.
export const modernRoutes = createRoutesFromElements(modernRouteElements)[0]?.children ?? [];
