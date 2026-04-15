import { useEffect, useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InfomodeWrapper } from '@/components/infomode/InfomodeWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { CardPagination } from '@/components/CardPagination'
import { LabAddressTypeBadge } from '@/components/lab/LabAddressTypeBadge'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import { formatSats } from '@/lib/bitcoin-utils'
import {
  LAB_ENTITY_NAME_MAX_LENGTH,
  validateLabEntityRenameName,
} from '@/lib/lab-owner'
import { LAB_CARD_PAGE_SIZE } from '@/lib/lab-paginated-queries'
import { useFeatureStore } from '@/stores/featureStore'
import {
  AddressType,
  selectCommittedAddressType,
  useWalletStore,
} from '@/stores/walletStore'
import { useLabChainStateQuery } from '@/hooks/useLabChainStateQuery'
import { useLabEntitiesPage } from '@/hooks/useLabPaginatedQueries'
import {
  useLabCreateLabEntityMutation,
  useLabDeleteLabEntityMutation,
  useLabRenameLabEntityMutation,
  useLabSetEntityDeadMutation,
} from '@/hooks/useLabMutations'
import { toast } from 'sonner'
import { Skull, FlaskConical } from 'lucide-react'

export function LabEntitiesCard() {
  const labNetworkEnabled = useWalletStore((s) => s.networkMode === 'lab')
  const segwitAddressesEnabled = useFeatureStore((s) => s.segwitAddressesEnabled)
  const committedAddressType = useWalletStore(selectCommittedAddressType)
  const [pageIndex, setPageIndex] = useState(0)
  const [newEntityName, setNewEntityName] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  /** Taproot vs SegWit for the next create — defaults to Settings / committed wallet address type. */
  const [newEntityUseTaproot, setNewEntityUseTaproot] = useState(
    () =>
      selectCommittedAddressType(useWalletStore.getState()) ===
      AddressType.Taproot,
  )

  useEffect(() => {
    setNewEntityUseTaproot(committedAddressType === AddressType.Taproot)
  }, [committedAddressType])

  const { data: labState } = useLabChainStateQuery()
  const entitiesForValidation =
    labState?.entities?.map((e) => ({
      labEntityId: e.labEntityId,
      entityName: e.entityName,
    })) ?? []

  const { data, isLoading, isError, refetch } = useLabEntitiesPage(pageIndex, {
    enabled: labNetworkEnabled,
  })
  const rows = data?.rows ?? []
  const totalCount = data?.totalCount ?? 0

  const createMutation = useLabCreateLabEntityMutation()
  const renameMutation = useLabRenameLabEntityMutation()
  const deleteMutation = useLabDeleteLabEntityMutation()
  const setDeadMutation = useLabSetEntityDeadMutation()

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(totalCount / LAB_CARD_PAGE_SIZE) - 1)
    if (pageIndex > maxPage) setPageIndex(maxPage)
  }, [pageIndex, totalCount])

  const busy =
    createMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending ||
    setDeadMutation.isPending

  const onCreate = () => {
    const trimmed = newEntityName.trim()
    const labAddressType = newEntityUseTaproot
      ? AddressType.Taproot
      : AddressType.SegWit
    if (trimmed.length > 0) {
      const v = validateLabEntityRenameName(trimmed, entitiesForValidation, -1)
      if (!v.ok) {
        toast.error(v.error)
        return
      }
    }
    void createMutation.mutateAsync(
      trimmed.length > 0
        ? { ownerName: trimmed, labAddressType }
        : { labAddressType },
      {
        onSuccess: () => {
          setNewEntityName('')
          setNewEntityUseTaproot(
            selectCommittedAddressType(useWalletStore.getState()) ===
              AddressType.Taproot,
          )
          void refetch()
        },
      },
    )
  }

  const beginRename = (labEntityId: number, entityName: string | null) => {
    setRenamingId(labEntityId)
    setRenameDraft(entityName ?? '')
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const saveRename = () => {
    if (renamingId == null) return
    const trimmed = renameDraft.trim()
    const v = validateLabEntityRenameName(trimmed, entitiesForValidation, renamingId)
    if (!v.ok) {
      toast.error(v.error)
      return
    }
    void renameMutation.mutateAsync(
      { labEntityId: renamingId, newName: trimmed },
      {
        onSuccess: () => {
          cancelRename()
          void refetch()
        },
      },
    )
  }

  const confirmDelete = () => {
    if (deleteId == null) return
    void deleteMutation.mutateAsync(deleteId, {
      onSuccess: () => {
        setDeleteId(null)
        void refetch()
      },
      onError: () => {
        setDeleteId(null)
      },
    })
  }

  const rowPendingDelete = deleteId != null ? rows.find((r) => r.labEntityId === deleteId) : undefined

  return (
    <>
      <InfomodeWrapper
        infoId="lab-entities-card"
        infoTitle="Lab entities"
        infoText="Simulated participants with their own descriptor wallets in the lab database. Create named or anonymous entities, rename them without rewriting the transaction graph, mark them as dead to exclude them from random transactions, or delete them when they have no activity."
        className="rounded-xl"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Lab entities
            </CardTitle>
            <CardDescription>
              Simulator participants — optional name, same rules as mining’s lab-entity branch
            </CardDescription>
            <p className="text-sm text-muted-foreground pt-1 max-w-prose">
              Lab entities use <span className="font-medium text-foreground/90">simple wallets</span> (one
              address type per entity). The Bitboard Wallet uses{' '}
              <span className="font-medium text-foreground/90">advanced wallets</span> that support multiple
              address types.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="new-lab-entity-name">Name (optional)</Label>
                  <Input
                    id="new-lab-entity-name"
                    type="text"
                    placeholder="Alice"
                    value={newEntityName}
                    onChange={(e) => setNewEntityName(e.target.value)}
                    disabled={!labNetworkEnabled || busy}
                    className="max-w-md"
                    maxLength={LAB_ENTITY_NAME_MAX_LENGTH}
                  />
                </div>
                <Button
                  type="button"
                  onClick={onCreate}
                  disabled={!labNetworkEnabled || busy}
                >
                  {createMutation.isPending ? 'Creating…' : 'Create lab entity'}
                </Button>
              </div>
              {segwitAddressesEnabled ? (
                <div className="flex flex-col gap-2 max-w-md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="new-lab-entity-address-type" className="text-base">
                        Address type
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {newEntityUseTaproot ? 'Taproot (BIP86)' : 'SegWit (BIP84)'} — matches Settings until
                        you change this switch.
                      </p>
                    </div>
                    <Switch
                      id="new-lab-entity-address-type"
                      checked={newEntityUseTaproot}
                      onCheckedChange={setNewEntityUseTaproot}
                      disabled={!labNetworkEnabled || busy}
                      aria-label="Use Taproot address type (BIP86); off for SegWit (BIP84)"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {!labNetworkEnabled ? (
              <p className="text-sm text-muted-foreground">Switch to lab network to manage entities.</p>
            ) : isLoading && totalCount === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Loading entities…</p>
            ) : isError ? (
              <p className="text-sm text-destructive py-2">Could not load lab entities.</p>
            ) : totalCount === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No lab entities yet.</p>
            ) : (
              <CardPagination
                pageSize={LAB_CARD_PAGE_SIZE}
                totalCount={totalCount}
                pageIndex={pageIndex}
                onPageChange={setPageIndex}
                ariaLabel="Lab entities page"
              >
                <div className="space-y-3">
                  <div className="flex gap-4 text-sm font-medium text-muted-foreground border-b border-border pb-2">
                    <span className="flex-1 min-w-0">Name</span>
                    <span className="w-28 shrink-0 text-right">Balance</span>
                    <span className="w-52 shrink-0 text-right">Actions</span>
                  </div>
                  {rows.map((row) => (
                    <div
                      key={row.labEntityId}
                      className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4 py-3 border-b border-border last:border-0"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        {renamingId === row.labEntityId ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              disabled={busy}
                              className="max-w-xs"
                              aria-label="New name"
                              maxLength={LAB_ENTITY_NAME_MAX_LENGTH}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" type="button" onClick={saveRename} disabled={busy}>
                                Save
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={cancelRename}
                                disabled={busy}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium break-words">{row.displayName}</span>
                            <LabAddressTypeBadge addressType={row.addressType} />
                            {row.isDead ? (
                              <Badge variant="secondary" className="gap-1">
                                <Skull className="h-3 w-3" />
                                Dead
                              </Badge>
                            ) : null}
                          </div>
                        )}
                        {row.hasTransactions ? (
                          <p className="text-xs text-muted-foreground">
                            Has transactions — delete is disabled until the chain no longer references this entity.
                          </p>
                        ) : null}
                      </div>
                      <span className="tabular-nums text-sm sm:w-28 sm:text-right sm:shrink-0">
                        {formatSats(row.balanceSats)} sats
                      </span>
                      <div className="flex flex-wrap gap-2 justify-end sm:w-52 sm:shrink-0">
                        {renamingId !== row.labEntityId ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => beginRename(row.labEntityId, row.entityName)}
                            disabled={busy}
                          >
                            Rename
                          </Button>
                        ) : null}
                        {row.isDead ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void setDeadMutation.mutateAsync(
                                { labEntityId: row.labEntityId, dead: false },
                                { onSuccess: () => void refetch() },
                              )
                            }
                            disabled={busy}
                          >
                            Unkill
                          </Button>
                        ) : row.hasTransactions ? (
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() =>
                              void setDeadMutation.mutateAsync(
                                { labEntityId: row.labEntityId, dead: true },
                                { onSuccess: () => void refetch() },
                              )
                            }
                            disabled={busy}
                          >
                            Kill
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            type="button"
                            variant="destructive"
                            onClick={() => setDeleteId(row.labEntityId)}
                            disabled={busy}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardPagination>
            )}
          </CardContent>
        </Card>
      </InfomodeWrapper>

      <ConfirmationDialog
        open={deleteId != null}
        title="Delete lab entity?"
        message={
          rowPendingDelete
            ? `Permanently remove “${rowPendingDelete.displayName}” and its lab wallet data? This cannot be undone.`
            : 'Permanently remove this lab entity? This cannot be undone.'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </>
  )
}
