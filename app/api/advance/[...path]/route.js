import { getSessionToken, outSystemsUrl } from '@/lib/server/outSystems';
import { createAdvanceGateway } from '@/lib/server/advanceGateway.mjs';

async function handle(request, context) {
  const { path = [] } = await context.params;
  const gateway = createAdvanceGateway({
    baseUrl: outSystemsUrl(''),
    serviceKey: process.env.OUTSYSTEMS_INTERNAL_SERVICE_KEY || '',
    acceptanceEnabled: process.env.P6_ADVANCE_ACCEPTANCE_ENABLED === 'true',
    siteOrigin: process.env.P6_FRONTEND_ORIGIN || '',
  });
  const result = await gateway(request, path, await getSessionToken());
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}

export const GET = handle;
export const POST = handle;
