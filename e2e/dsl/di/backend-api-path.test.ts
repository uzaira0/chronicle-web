import { describe, expect, it } from 'bun:test';
import {
  backendTargetPath,
  isBackendApiPath,
  isInternalWebApiPath,
  isSameOriginRequest,
} from '../../../scripts/backend-api-path';

describe('isBackendApiPath', () => {
  it('matches both backend API families and their roots', () => {
    expect(isBackendApiPath('/chronicle/v3')).toBe(true);
    expect(isBackendApiPath('/chronicle/v3/study')).toBe(true);
    expect(isBackendApiPath('/chronicle/api/web')).toBe(true);
    expect(isBackendApiPath('/chronicle/api/web/study')).toBe(true);
  });

  it('does not proxy static assets, SPA routes, or prefix siblings', () => {
    expect(isBackendApiPath('/chronicle/chunk-app.js')).toBe(false);
    expect(isBackendApiPath('/chronicle/studies')).toBe(false);
    expect(isBackendApiPath('/chronicle/v30/study')).toBe(false);
    expect(isBackendApiPath('/chronicle/api/websocket')).toBe(false);
  });
});

describe('backendTargetPath', () => {
  it('mirrors the production web API rewrite', () => {
    expect(backendTargetPath('/chronicle/api/web')).toBe('/chronicle/v3');
    expect(backendTargetPath('/chronicle/api/web/')).toBe('/chronicle/v3/');
    expect(backendTargetPath('/chronicle/api/web/study')).toBe(
      '/chronicle/v3/study',
    );
  });

  it('leaves direct API paths and prefix siblings unchanged', () => {
    expect(backendTargetPath('/chronicle/v3/study')).toBe(
      '/chronicle/v3/study',
    );
    expect(backendTargetPath('/chronicle/api/websocket')).toBe(
      '/chronicle/api/websocket',
    );
  });
});

describe('isInternalWebApiPath', () => {
  it('only identifies the internal web API family', () => {
    expect(isInternalWebApiPath('/chronicle/api/web/study')).toBe(true);
    expect(isInternalWebApiPath('/chronicle/v3/study')).toBe(false);
    expect(isInternalWebApiPath('/chronicle/api/websocket')).toBe(false);
  });
});

describe('isSameOriginRequest', () => {
  const requestUrl = new URL('http://127.0.0.1:4174/chronicle/api/web/study');

  it('recognizes the public reverse-proxy origin', () => {
    expect(isSameOriginRequest(requestUrl, 'http://127.0.0.1:4174')).toBe(true);
  });

  it('preserves foreign, missing, and malformed origins for backend rejection', () => {
    expect(isSameOriginRequest(requestUrl, 'https://attacker.example')).toBe(
      false,
    );
    expect(isSameOriginRequest(requestUrl, null)).toBe(false);
    expect(isSameOriginRequest(requestUrl, 'not an origin')).toBe(false);
  });
});
