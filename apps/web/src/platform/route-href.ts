export const usesHashRoutes = import.meta.env.VITE_GITHUB_PAGES === 'true';

export function routeHref(destination: string) {
  return usesHashRoutes ? import.meta.env.BASE_URL + '#' + destination : destination;
}
