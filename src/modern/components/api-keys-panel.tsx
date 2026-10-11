import { KeyRound } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslator } from '@/i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDisplayDate } from '@/lib/format';
import { useResearcherCreateIntent } from '@/lib/use-researcher-create-intent';
import {
  type ApiKeyInfo,
  type ApiKeyScope,
  useCreateStudyApiKeyMutation,
  useGetStudyApiKeyScopesQuery,
  useListStudyApiKeysQuery,
  useRevokeStudyApiKeyMutation,
} from '@/state/study-operations-api';

// The server caps a key's lifetime by scope (ApiKeyService.maxTtlDaysForScope).
export const MAX_EXPIRY_DAYS: Record<ApiKeyScope, number> = { ADMIN: 30, READ_ONLY: 365, WRITE: 90 };
const SCOPE_LABEL_KEYS: Record<ApiKeyScope, string> = {
  ADMIN: 'api_keys.scope_admin',
  READ_ONLY: 'api_keys.scope_read_only',
  WRITE: 'api_keys.scope_write',
};

function validKeyDraft(name: string, days: number, maxDays: number) {
  return name.trim() !== '' && Number.isInteger(days) && days >= 1 && days <= maxDays;
}

/**
 * Researcher API keys for one study: list, and, for users who may modify the study, create and revoke.
 * The raw key is shown once, right after creation; the server never returns it again.
 */
export function ApiKeysPanel({ studyId }: { studyId: string }) {
  const { t } = useTranslator();
  const { data: keys = [], error, isError, isLoading } = useListStudyApiKeysQuery(studyId);
  // Only scopes the user holds themselves are offered; creating or revoking needs study modify (WRITE) access.
  const scopesQuery = useGetStudyApiKeyScopesQuery(studyId);
  const heldScopes = scopesQuery.data ?? [];
  const canModify = !scopesQuery.isError && heldScopes.includes('WRITE');
  const createIntent = useResearcherCreateIntent(`/study/${studyId}/api-keys`);
  const [createKey, { isLoading: isCreating }] = useCreateStudyApiKeyMutation();
  const [revokeKey, { isLoading: isRevoking }] = useRevokeStudyApiKeyMutation();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKeyScope>('READ_ONLY');
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ keyId: string; name: string } | null>(null);
  // The raw key belongs to the study it was created on: drop it when the panel switches study.
  const [rawKeyStudyId, setRawKeyStudyId] = useState(studyId);
  if (rawKeyStudyId !== studyId) {
    setRawKeyStudyId(studyId);
    setRawKey(null);
  }
  // Bumped on every study switch, read when a create request resolves: a response from an older
  // generation is stale even once the panel is back on the study it was issued for (A -> B -> A).
  const studyGeneration = useRef({ generation: 0, studyId });
  useLayoutEffect(() => {
    if (studyGeneration.current.studyId === studyId) return;
    studyGeneration.current = { generation: studyGeneration.current.generation + 1, studyId };
  }, [studyId]);

  // Device keys are issued per participant at enrollment; this panel manages researcher keys only.
  const researcherKeys = keys.filter((key) => !key.participantId);
  const maxDays = MAX_EXPIRY_DAYS[scope];
  const days = Number(expiresInDays);
  const canCreate = validKeyDraft(name, days, maxDays) && !isCreating;

  const handleCreate = async () => {
    setActionError(null);
    const { generation } = studyGeneration.current;
    const body = { expiresInDays: days, name: name.trim(), scope, studyId };
    const intent = await createIntent.currentIntent(body);
    const request = createKey({ ...body, idempotencyKey: intent.key });
    try {
      const created = await request.unwrap();
      await createIntent.acknowledge(intent);
      // A response issued before a study switch is never shown, on another study or on this one again.
      if (studyGeneration.current.generation !== generation) return;
      setRawKey(created.rawKey);
      setName('');
    } catch (err) {
      if (studyGeneration.current.generation === generation)
        setActionError(getErrorMessage(err, t('api_keys.create_failed')));
    } finally {
      // The raw key lives only in this component's state: drop the response from the store's mutation cache.
      request.reset();
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeError(null);
    try {
      await revokeKey({ keyId: revokeTarget.keyId, studyId }).unwrap();
      setRevokeTarget(null);
    } catch (err) {
      setRevokeError(getErrorMessage(err, t('api_keys.revoke_failed')));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t('api_keys.title')}
          </span>
        </CardTitle>
        <CardDescription>{t('api_keys.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {scopesQuery.isError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive" role="alert">
                {getErrorMessage(scopesQuery.error, t('api_keys.scopes_failed'))}
              </p>
              <Button variant="outline" onClick={() => void scopesQuery.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          )}
          {canModify && (
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="api-key-name">{t('api_keys.name')}</Label>
                <Input id="api-key-name" maxLength={255} onChange={(e) => setName(e.target.value)} value={name} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api-key-scope">{t('api_keys.scope')}</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  id="api-key-scope"
                  onChange={(e) => {
                    const next = e.target.value as ApiKeyScope;
                    setScope(next);
                    if (Number(expiresInDays) > MAX_EXPIRY_DAYS[next]) setExpiresInDays(String(MAX_EXPIRY_DAYS[next]));
                  }}
                  value={scope}
                >
                  {heldScopes.map((value) => (
                    <option key={value} value={value}>
                      {t(SCOPE_LABEL_KEYS[value])}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api-key-expiry">{t('api_keys.expiry_days', { max: String(maxDays) })}</Label>
                <Input
                  id="api-key-expiry"
                  max={maxDays}
                  min={1}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  type="number"
                  value={expiresInDays}
                />
              </div>
              <div className="flex justify-end sm:col-span-4">
                <Button disabled={!canCreate} onClick={() => void handleCreate()}>
                  {t('api_keys.create')}
                </Button>
              </div>
            </div>
          )}

          {rawKey && <IssuedApiKey rawKey={rawKey} onDismiss={() => setRawKey(null)} />}

          {actionError && (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}

          {isError ? (
            <p className="text-sm text-destructive" role="alert">
              {getErrorMessage(error, t('api_keys.load_failed'))}
            </p>
          ) : (
            <ApiKeysTable
              researcherKeys={researcherKeys}
              canModify={canModify}
              isLoading={isLoading}
              onRevoke={(key) => {
                setRevokeError(null);
                setRevokeTarget({ keyId: key.keyId, name: key.name });
              }}
            />
          )}
        </div>
      </CardContent>
      <Dialog
        onOpenChange={(open) => {
          if (!open && !isRevoking) setRevokeTarget(null);
        }}
        open={revokeTarget !== null}
      >
        <DialogContent className="w-11/12 max-w-md">
          <DialogTitle>{t('api_keys.revoke_title')}</DialogTitle>
          <DialogDescription>{t('api_keys.revoke_confirmation', { name: revokeTarget?.name ?? '' })}</DialogDescription>
          {revokeError && (
            <p className="text-sm text-destructive" role="alert">
              {revokeError}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button disabled={isRevoking} onClick={() => setRevokeTarget(null)} variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button disabled={isRevoking || !revokeTarget} onClick={() => void handleRevoke()} variant="destructive">
              {isRevoking ? t('api_keys.revoking') : t('api_keys.confirm_revoke')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function IssuedApiKey({ rawKey, onDismiss }: { rawKey: string; onDismiss: () => void }) {
  const { t } = useTranslator();
  return (
    <div className="space-y-2 rounded-md border border-warning bg-warning-bg p-3">
      <p className="text-sm font-medium">{t('api_keys.shown_once')}</p>
      <div className="flex items-center gap-2">
        <code className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{rawKey}</code>
        <CopyButton aria-label={t('api_keys.copy')} size="icon-xs" value={rawKey} variant="ghost-muted" />
      </div>
      <Button onClick={onDismiss} size="sm" variant="outline">
        {t('api_keys.dismiss')}
      </Button>
    </div>
  );
}

function ApiKeysTable({
  researcherKeys,
  canModify,
  isLoading,
  onRevoke,
}: {
  researcherKeys: ApiKeyInfo[];
  canModify: boolean;
  isLoading: boolean;
  onRevoke: (key: ApiKeyInfo) => void;
}) {
  const { t } = useTranslator();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('api_keys.name')}</TableHead>
          <TableHead>{t('api_keys.prefix')}</TableHead>
          <TableHead>{t('api_keys.scope')}</TableHead>
          <TableHead>{t('api_keys.created')}</TableHead>
          <TableHead>{t('api_keys.expires')}</TableHead>
          <TableHead>{t('api_keys.last_used')}</TableHead>
          {canModify && <TableHead className="w-24" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {researcherKeys.length === 0 ? (
          <TableRow>
            <TableCell className="h-16 text-center" colSpan={canModify ? 7 : 6}>
              {isLoading ? t('common.loading') : t('api_keys.none')}
            </TableCell>
          </TableRow>
        ) : (
          researcherKeys.map((key) => (
            <TableRow key={key.keyId}>
              <TableCell>{key.name}</TableCell>
              <TableCell>
                <code className="font-mono text-xs">{key.prefix}</code>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{t(SCOPE_LABEL_KEYS[key.scope])}</Badge>
              </TableCell>
              <TableCell>{formatDisplayDate(key.createdAt)}</TableCell>
              <TableCell>{formatDisplayDate(key.expiresAt)}</TableCell>
              <TableCell>{key.lastUsedAt ? formatDisplayDate(key.lastUsedAt) : t('api_keys.never_used')}</TableCell>
              {canModify && (
                <TableCell>
                  <Button onClick={() => onRevoke(key)} size="sm" variant="outline-destructive">
                    {t('api_keys.revoke')}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
