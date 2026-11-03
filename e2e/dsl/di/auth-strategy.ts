import type { BrowserContext } from '@playwright/test';
import { DIRECT_API_ROOT, INTERNAL_WEB_API_ROOT } from '../../../scripts/backend-api-path';
import { HEADER_CONTENT_TYPE, MIME_JSON, TESTING_LOGIN_PATH } from '../constants.js';

export interface AuthResult {
  authToken: string;
  csrfToken: string;
}

export interface AuthStrategy {
  authenticate(context: BrowserContext, userId: string): Promise<AuthResult>;
}

export class TestingLoginStrategy implements AuthStrategy {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async authenticate(context: BrowserContext, userId: string): Promise<AuthResult> {
    const response = await context.request.post(
      `${this.baseUrl}${TESTING_LOGIN_PATH.replace(DIRECT_API_ROOT, INTERNAL_WEB_API_ROOT)}`,
      {
        data: { userId },
        headers: { [HEADER_CONTENT_TYPE]: MIME_JSON },
      },
    );
    if (!response.ok()) {
      throw new Error(`testing-login failed for userId=${userId}: HTTP ${response.status()} ${await response.text()}`);
    }
    const body = (await response.json()) as { authToken?: string; csrfToken?: string };
    if (!body.authToken) {
      throw new Error(`testing-login response missing authToken for userId=${userId}`);
    }
    if (!body.csrfToken) {
      throw new Error(`testing-login response missing csrfToken for userId=${userId}`);
    }
    return { authToken: body.authToken, csrfToken: body.csrfToken };
  }
}
