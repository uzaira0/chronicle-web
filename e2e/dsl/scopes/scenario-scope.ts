import {
  request as playwrightRequest,
  type BrowserContext,
  type Request,
  type Route,
} from '@playwright/test';
import type { ScenarioContext } from '../scenario-context.js';
import { AuthScope } from './auth-scope.js';
import { TESTING_LOGIN_ROUTE_GLOB } from '../constants.js';

export class ScenarioScope {
  readonly ctx: ScenarioContext;
  readonly context: BrowserContext;

  constructor(ctx: ScenarioContext, context: BrowserContext) {
    this.ctx = ctx;
    this.context = context;
  }

  async asUser(userId: string, block: (auth: AuthScope) => Promise<void>): Promise<void> {
    const { authToken, csrfToken } = await this.ctx.providers.auth.authenticate(
      this.context,
      userId,
    );
    // Resource cleanup must survive a page/global test timeout closing the
    // BrowserContext. Snapshot the freshly authenticated cookie jar into a
    // standalone request context before page bootstrap can rotate it.
    const cleanupRequest = await playwrightRequest.newContext({
      storageState: await this.context.storageState(),
    });
    const cleanupClient = {
      request: cleanupRequest,
      baseUrl: this.ctx.providers.baseUrl,
      csrfToken,
    };
    // LIFO ordering disposes this only after all subsequently registered
    // resource cleanup actions have run.
    this.ctx.pushCleanup(() => cleanupRequest.dispose());
    // The frontend's bootstrap-auth re-fires POST /v3/auth/testing-login with body {}
    // on every fresh page load when /v3/auth/session reports unauthenticated (it always does;
    // session reads Spring's userPrincipal which is null for /v3/auth/* paths by design).
    // The backend defaults empty-body to test_user1, overwriting our cookies and stranding
    // any DSL-seeded resources behind a different principal. Rewrite the bootstrap call to
    // pin the userId we authenticated as.
    const handler = async (route: Route, request: Request): Promise<void> => {
      if (request.method() !== 'POST') {
        await route.continue();
        return;
      }
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
      } catch {
        body = {};
      }
      if (typeof body.userId === 'string' && body.userId.length > 0) {
        await route.continue();
        return;
      }
      await route.continue({ postData: JSON.stringify({ userId }) });
    };
    await this.context.route(TESTING_LOGIN_ROUTE_GLOB, handler);
    const client = {
      request: this.context.request,
      baseUrl: this.ctx.providers.baseUrl,
      context: this.context,
      token: authToken,
    };
    try {
      await block(
        new AuthScope(
          this.ctx,
          userId,
          client,
          cleanupClient,
          this.context,
        ),
      );
    } finally {
      try {
        await this.context.unroute(TESTING_LOGIN_ROUTE_GLOB, handler);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('Target page, context or browser has been closed')) {
          throw error;
        }
      }
    }
  }
}
